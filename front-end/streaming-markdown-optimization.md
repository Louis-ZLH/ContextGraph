# 流式 Markdown 渲染优化方案

## 问题分析

### 现状架构

```
useChatStream (50ms batch)
  └→ Redux: appendStreamToken → message.content 更新
      └→ AssistantMessage (memo, 仅正在流式的消息重渲染)
          └→ useStreamingBuffer (rAF, 3 chars/frame, ~60fps setState)
              └→ MarkdownRenderer (memo)
                  └→ ReactMarkdown (全量解析整个文档)
                      ├── remarkGfm
                      ├── remarkMath
                      ├── rehypeKatex
                      └── SyntaxHighlighter (每个代码块)
```

### 瓶颈

1. **全量解析**：`ReactMarkdown` 每次收到新 content 都会重新解析**整个文档**的 AST。当回复到 500+ 字后，每次 flush 的解析开销线性增长，慢模型体感越来越卡。

2. **渲染频率过高**：`useStreamingBuffer` 用 rAF 逐字显示，导致 ~60fps 触发 `setDisplayed`，但每次都会让 `MarkdownRenderer` 全量重跑一遍 remark/rehype pipeline。快模型（Gemini）可以接受这个开销因为有大量 token 需要平滑，慢模型（Opus/DeepSeek）每批只有几个字，rAF 循环大部分帧是空转浪费。

3. **重型插件**：`remarkMath` + `rehypeKatex` + `SyntaxHighlighter` 三个重型插件在每次渲染时都会执行，即使文档中没有数学公式或代码块。

### 性能影响量化

假设文档有 N 个字符，token flush 频率 F 次/秒：
- **当前方案**：每秒渲染 ~60 次（rAF），每次 O(N) 解析 → 总开销 O(60N)
- **优化后**：每秒渲染 ~20 次（50ms batch），只解析最后一个 block O(1) → 总开销 O(20)

---

## 优化方案

### 核心思路：Block 级别 Memoization

参考 [Vercel AI SDK Cookbook](https://ai-sdk.dev/cookbook/next/markdown-chatbot-with-memoization) 的方案：

1. 用 `marked.lexer()` 将 markdown 文本拆成 block tokens（段落、标题、代码块、列表等）
2. 每个 block 用 `React.memo` 包裹，独立渲染
3. 新 token 到达时，只有最后一个 block 的 raw text 发生变化，前面所有 block 被 memo 跳过

### 目标架构

```
useChatStream (50ms batch)
  └→ Redux: appendStreamToken → message.content 更新
      └→ AssistantMessage (memo)
          └→ useStreamingBuffer (保留，给快模型平滑效果)
              └→ MemoizedMarkdown
                    ├── Block 0: <p>段落1</p>         (memo 命中, 跳过) ✓
                    ├── Block 1: <pre>代码块</pre>     (memo 命中, 跳过) ✓
                    ├── Block 2: <p>段落2</p>         (memo 命中, 跳过) ✓
                    └── Block 3: <p>正在输出...</p>    (content 变了, 重渲染) ← 唯一开销
```

---

## 具体修改

### 第一步：安装 marked（用于 block 拆分）

```bash
npm install marked
```

`marked.lexer()` 只做词法分析（拆 block），不做 HTML 渲染。我们仍然用 `react-markdown` 做渲染，保持现有的自定义 components（代码高亮、链接样式等）不变。

### 第二步：修改 MarkdownRenderer.tsx

**改动内容**：

将现有的单体 `MarkdownRenderer` 拆成三层：

```
MarkdownRenderer (外壳, 提供 prose 样式容器)
  └→ MemoizedMarkdown (拆 blocks + 映射)
       └→ MemoizedMarkdownBlock × N (每个 block 独立 memo)
```

**新增函数 `parseMarkdownIntoBlocks`**：
- 调用 `marked.lexer(content)` 将 markdown 拆成 token 数组
- 对 LaTeX 格式的 normalizeLatex 处理移到这里，只处理当前 block

**新增组件 `MemoizedMarkdownBlock`**：
- `memo` 包裹，自定义比较函数：只比较 `content` 字段
- 内部使用现有的 `ReactMarkdown` + `remarkGfm` + `remarkMath` + `rehypeKatex` + 自定义 `components`
- 每个 block 独立渲染，content 没变则完全跳过

**新增组件 `MemoizedMarkdown`**：
- 接收完整 `content` 和 `id`（消息 id，用于稳定 key）
- `useMemo` 缓存 `parseMarkdownIntoBlocks(content)` 的结果
- 映射每个 block 为 `<MemoizedMarkdownBlock key={id-block_i} />`

**保留原有 `MarkdownRenderer`**：
- 外壳组件，提供 `prose prose-sm max-w-none` 容器和 CSS 变量
- 内部从直接渲染 `<ReactMarkdown>` 改为渲染 `<MemoizedMarkdown>`

### 第三步：改造 useStreamingBuffer — 自适应速率匀速吐字

Block memo 解决性能瓶颈后，高频 setState 不再是问题（每帧只重解析最后一个小 block，O(1)）。
因此可以放心使用 rAF 逐字显示，让所有模型都有匀速打字机效果。

**问题**：现有 `useStreamingBuffer` 固定 `CHARS_PER_FRAME = 3`，对快模型太慢（buffer 越积越多），对慢模型太快（一帧就追上了，没有逐字效果）。

**方案**：自适应速率，根据 buffer 积压量动态计算每帧吐出字符数。

```typescript
const MIN_CHARS = 1;          // 最少每帧 1 字符（慢模型匀速感）
const DRAIN_FRAMES = 8;       // 目标：8 帧内消化完当前积压（~133ms @60fps）

function useStreamingBuffer(content: string, isStreaming: boolean): string {
  const [displayed, setDisplayed] = useState(content);
  const posRef = useRef(content.length);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!isStreaming) {
      cancelAnimationFrame(rafRef.current);
      posRef.current = content.length;
      setDisplayed(content);
      return;
    }

    const tick = () => {
      if (posRef.current < content.length) {
        const remaining = content.length - posRef.current;
        const step = Math.max(MIN_CHARS, Math.ceil(remaining / DRAIN_FRAMES));
        posRef.current = Math.min(posRef.current + step, content.length);
        setDisplayed(content.slice(0, posRef.current));
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [content, isStreaming]);

  return isStreaming ? displayed : content;
}
```

**行为效果**：

| 场景 | buffer 积压 | step 计算 | 体感 |
|------|------------|-----------|------|
| Opus/DeepSeek（50ms 攒 2-5 字符）| ~3 字符 | max(1, ceil(3/8)) = 1 | 匀速逐字，丝滑 |
| GPT-4o（50ms 攒 5-10 字符）| ~8 字符 | max(1, ceil(8/8)) = 1 | 匀速逐字 |
| Gemini Flash（50ms 攒 20-30 字符）| ~25 字符 | max(1, ceil(25/8)) = 4 | 快速但平滑 |
| 首批大段到达 | ~100 字符 | max(1, ceil(100/8)) = 13 | 快速追赶，不会积压 |

**核心特性**：
- **慢模型**：每批就几个字符，`remaining / DRAIN_FRAMES` 向上取整为 1，变成逐字显示，把"一坨蹦出"变成"匀速打字"
- **快模型**：积压多时自动加速，保证 ~133ms 内消化完，不会越攒越多导致延迟
- **自平衡**：无需根据模型手动配置，速率自动适配到达速度

**为什么之前 rAF 有问题，现在可以放心用？**

```
之前：rAF 60fps × ReactMarkdown 全量解析 O(N) = 卡死
现在：rAF 60fps × Block memo 只解析最后一个 block O(1) = 毫无压力
```

### 第四步：AssistantMessage.tsx 无需修改

`AssistantMessage` 调用 `MarkdownRenderer` 的方式完全不变：

```tsx
<MarkdownRenderer content={displayedContent} theme={theme} />
```

只是 `MarkdownRenderer` 内部从全量渲染变成了分块 memo 渲染。

---

## 不改动的部分

| 组件/模块 | 原因 |
|-----------|------|
| `useChatStream.ts` | 50ms 批处理逻辑不变 |
| `chatSlice.ts` | Redux state 结构不变 |
| `AssistantMessage.tsx` | 调用接口不变（内部 useStreamingBuffer 逻辑改动，但接口不变） |
| `index.css` 动画 | `stream-fade-in` 等 CSS 动画保留 |
| 自定义 components | 代码高亮、链接样式、CopyButton 全部保留 |

## 文件变更汇总

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | 修改 | 添加 `marked` 依赖 |
| `src/ui/MarkdownRenderer.tsx` | 修改 | 拆分为 block 级别 memoized 渲染 |
| `src/ui/canvas/ChatNode/Message/AssistantMessage.tsx` | 修改 | `useStreamingBuffer` 改为自适应速率 |

总共改 2 个源文件 + 1 个依赖安装。
