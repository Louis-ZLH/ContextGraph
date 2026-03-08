# Dark Mode Refactoring Plan

> 将 Cyber 主题改造为参考 Claude & ChatGPT 的现代 Dark 风格（保留 SaaS 和 Paper 主题不变）

---

## 1. 改造范围

**只改 Cyber → Dark，其余不动：**
- SaaS 主题 → 保留不变
- Paper 主题 → 保留不变
- Landing Page / Auth Pages → 保留不变（它们使用 Paper 风格，与本次改造无关）
- Cyber 主题 → 重构为 Dark 主题

---

## 2. Cyber vs 目标 Dark 风格对比

| 属性 | 当前 Cyber | 目标 Dark（参考 Claude & ChatGPT） |
|------|-----------|----------------------------------|
| **主背景** | `#0b1120` 深蓝黑 | `#0f0f0f` 纯净深色（中性灰，非蓝调） |
| **侧边栏** | `#020617` 近纯黑蓝 | `#141414` 中性深灰 |
| **Header** | `rgba(15, 23, 42, 0.8)` 蓝调 | `rgba(20, 20, 20, 0.8)` 中性 |
| **Canvas** | `#0b1120` 蓝黑 | `#0f0f0f` 中性 |
| **边框** | `#334155` slate实色 | `rgba(255, 255, 255, 0.08)` 低对比白透明 |
| **主文本** | `#e2e8f0` 冷白 | `#e5e5e5` 柔和中性白 |
| **次要文本** | `#64748b` slate | `#737373` neutral |
| **强调色** | `#10b981` neon绿 | `#7c6aef` 紫（可讨论） |
| **强调色背景** | `rgba(16, 185, 129, 0.1)` | `rgba(124, 106, 239, 0.1)` |
| **Node背景** | `#1e293b` slate蓝 | `#1e1e1e` 中性 |
| **Node阴影** | `0 0 15px rgba(16,185,129,0.1)` neon glow | `0 0 0 1px rgba(255,255,255,0.06)` 极淡border |
| **User气泡** | `#10b981` 绿 + `#064e3b` 暗绿文字 | `#7c6aef` 紫 + `#ffffff` 白文字 |
| **AI气泡** | `#0f172a` 深蓝 | `#1e1e1e` 中性灰 |
| **Edge** | `#10b981` 绿 | `#525252` 低调灰 |
| **NProgress** | 渐变 `#d946ef → #22d3ee` 赛博粉青 | 纯色 `#7c6aef` 紫 |
| **字体** | `Fira Code` 等宽字体 | `Inter` 无衬线（同 SaaS） |
| **Scrollbar** | `#334155` slate色 | `#333333` / `#555555` 中性灰 |

### 核心设计原则（Claude/GPT Dark 风格）
- **去蓝调**：所有背景从 slate 蓝调 → neutral 中性灰
- **去 neon**：没有 glow/neon shadow，靠极淡 border 分层
- **去等宽字体**：Dark 模式用 Inter，不再用 Fira Code
- **克制配色**：强调色只在关键交互点出现，不弥漫

---

## 3. 改动文件清单

### 3.1 `src/index.css` — CSS 主题变量（核心改动）

**改动点：**

1. **重写** `[data-theme="cyber"]` 变量块 → 改为 `[data-theme="dark"]`：

```css
/* 2. Dark (原 Cyber，参考 Claude/ChatGPT) */
[data-theme="dark"] {
  --bg-app: #0f0f0f;
  --bg-sidebar: #141414;
  --bg-header: rgba(20, 20, 20, 0.8);
  --bg-canvas: #0f0f0f;
  --border-main: rgba(255, 255, 255, 0.08);

  --text-primary: #e5e5e5;
  --text-secondary: #737373;
  --accent: #7c6aef;
  --accent-light: rgba(124, 106, 239, 0.1);

  --node-bg: #1e1e1e;
  --node-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06);

  --bubble-user: #7c6aef;
  --bubble-user-text: #ffffff;
  --bubble-ai: #1e1e1e;
  --bubble-ai-text: #e5e5e5;

  --edge-stroke: #525252;
  --edge-opacity: 0.5;
  --edge-width: 1.5;
  --edge-dasharray: none;

  --nprogress-color: #7c6aef;
  --nprogress-shadow: 0 0 10px rgba(124, 106, 239, 0.3);
}
```

2. **修改** body 字体规则 — 将 `[data-theme="cyber"]` 的 Fira Code 改为 Inter：
```css
/* 改前 */
[data-theme="cyber"] body, [data-theme="cyber"] {
  font-family: "Fira Code", "Menlo", monospace;
}

/* 改后 */
[data-theme="dark"] body, [data-theme="dark"] {
  font-family: "Inter", system-ui, sans-serif;
}
```

3. **修改** `.CyberScroller` → `.DarkScroller`，颜色从 slate 改为 neutral：
```css
.DarkScroller {
  scrollbar-width: thin;
  scrollbar-color: #333333 transparent;
}
.DarkScroller::-webkit-scrollbar-thumb {
  background-color: #333333;
}
.DarkScroller::-webkit-scrollbar-thumb:hover {
  background-color: #555555;
}
```

4. **可选清理** `@theme` 中的 cyber-* 变量（`--color-cyber-dark` 等）— 如果只有 Cyber 主题在用，改为 dark 对应值或删除未使用的。

**不动的：**
- SaaS 主题变量 `:root, [data-theme="saas"]` — 完全保留
- Paper 主题变量 `[data-theme="paper"]` — 完全保留
- `.paper-card`、`.paper-card-hover`、`.paper-texture` — 完全保留
- `.glass-panel`、`.perspective-grid` — 保留（如果有其他地方用到）
- 所有动画 keyframes — 保留

---

### 3.2 `src/feature/user/userSlice.ts` — 主题系统

| 当前 | 改为 |
|------|------|
| `ThemeName = "saas" \| "cyber" \| "paper"` | `ThemeName = "saas" \| "dark" \| "paper"` |
| 默认主题 `"cyber"` | 默认 `"paper"` |
| `getInitialTheme()` 中匹配 `"cyber"` | 匹配 `"dark"`，默认返回 `"paper"` |

---

### 3.3 `src/ui/layout/Sidebar.tsx` — 条件分支更新

所有 `theme === "cyber"` 改为 `theme === "dark"`：

```tsx
// 改前
theme === "cyber" ? "hover:bg-white/10" : "hover:bg-black/10"
theme === "cyber" ? "CyberScroller" : "ModernScroller"

// 改后
theme === "dark" ? "hover:bg-white/10" : "hover:bg-black/10"
theme === "dark" ? "DarkScroller" : "ModernScroller"
```

---

### 3.4 `src/ui/layout/UserModal.tsx` — 主题选择器更新

更新主题列表中的 Cyber 选项：

```tsx
// 改前
{ name: "cyber", label: "Cyber", icon: Terminal, accent: "emerald", bg: "bg-slate-900", preview: "Dark & techy" }

// 改后
{ name: "dark", label: "Dark", icon: Moon, accent: "purple", bg: "bg-[#0f0f0f]", preview: "Clean & modern" }
```

更新所有 `theme === "cyber"` 条件判断为 `theme === "dark"`，以及相关的颜色：
- `emerald` 相关色 → `purple`/`violet` 相关色
- `bg-emerald-500/10` → `bg-violet-500/10`
- `text-emerald-400` → `text-violet-400`
- `border-emerald-500` → `border-violet-500`
- `ring-emerald-500` → `ring-violet-500`
- `bg-slate-900` → `bg-[#0f0f0f]`
- `border-slate-700` → `border-white/10`
- `hover:border-slate-500` → `hover:border-white/20`

---

## 4. 执行顺序

```
Step 1  ─  src/index.css: 重写 [data-theme="cyber"] → [data-theme="dark"]，
           修改字体规则，重命名 CyberScroller → DarkScroller
Step 2  ─  src/feature/user/userSlice.ts: ThemeName "cyber" → "dark"
Step 3  ─  src/ui/layout/Sidebar.tsx: 更新条件判断 "cyber" → "dark"
Step 4  ─  src/ui/layout/UserModal.tsx: 更新主题选择器和条件样式
Step 5  ─  验证 & 测试
```

---

## 5. 关键决策点（需确认）

| # | 问题 | 建议 |
|---|------|------|
| 1 | **Dark 主题强调色用什么？** 紫色 `#7c6aef` vs 保持绿色 `#10b981` vs 蓝色 `#3b82f6` | 建议紫色，更现代且与 Claude/GPT 区分 |
| 2 | **Dark 主题字体是否改为 Inter？** 还是保持 Fira Code 等宽 | 建议改为 Inter，等宽体大段阅读疲劳 |
| 3 | **`@theme` 中的 cyber-* 自定义变量如何处理？** 这些在 `.glass-panel` / `.perspective-grid` 中有引用 | 如果 landing page 不用，可以暂时保留不管 |

---

## 6. 不需要改动的文件

以下文件通过 CSS 变量自动适配，或属于 SaaS/Paper 风格：

**CSS 变量自动适配（改主题变量后自动生效）：**
- `src/ui/canvas/ChatNode/**` — 使用 `var(--node-bg)`, `var(--bubble-*)` 等
- `src/ui/canvas/CustomEdge.tsx` — 使用 `var(--edge-*)`
- `src/ui/canvas/ResourceNode/**` — 使用 `.source-node` 等类
- `src/ui/canvas/CanvasControls.tsx`
- `src/ui/layout/Header/**` — 使用 `bg-header`, `border-main` 等
- `src/ui/common/Modal.tsx`
- `src/ui/MarkdownRenderer.tsx`

**属于 Paper/SaaS 风格，本次不动：**
- `src/view/index.tsx` — Landing Page (Paper 风格)
- `src/ui/landing/*` — Landing 组件 (Paper 风格)
- `src/ui/auth/*` — Auth 组件 (Paper 风格)
- `src/view/auth/*` — Auth 页面 (Paper 风格)

---

## 7. 预计改动文件汇总

| 文件 | 改动量 | 说明 |
|------|-------|------|
| `src/index.css` | **中** | 重写 cyber 变量块 → dark，修改字体规则，重命名 scroller |
| `src/feature/user/userSlice.ts` | **小** | ThemeName "cyber" → "dark"，默认值更新 |
| `src/ui/layout/Sidebar.tsx` | **小** | 条件判断 "cyber" → "dark"，scroller 类名更新 |
| `src/ui/layout/UserModal.tsx` | **中** | 主题选项更新 + 条件颜色 emerald → violet |

**总计：4 个文件**
