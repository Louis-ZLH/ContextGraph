# Chat 模块 Code Review

## 一、逻辑错误

### P1

- [ ] **`emptyState` 被注释，切换 canvas 时 chat state 不清理**
  - 文件: `chatSlice.ts:16-20`
  - 问题: `emptyState` action 被注释掉，切换 canvas 后旧的 conversations 和 messages 持续累积在内存中，不会释放。
  - 修复建议: 恢复 `emptyState` action 或实现按 canvas 维度的清理逻辑，在 canvas 切换时调用。

  // 这里我考虑到相应的逻辑，觉得切换清楚不太稳妥，因为react-query讲究一次性拉取原则。所以不考虑清理，除非你有更好的解决方案。（设想一下场景， 某个node正在流式输出，如果你切换到另一个canvas，又重新切换回来，那node需要重新加载，并且不一定能续接上流式内容，后端一般在请求完成后，才会异步把内容写入数据库。 但是如果我一直不清理，就算我切换了canvas， message信息还在，appendStreamToken可以继续生效，回来只要把redux挂载就行）

## 二、未完成

### P1

- [ ] **Mode 功能未接入后端**
  - 文件: `ChatInput/index.tsx:38`, `ChatInput/PlusMenu.tsx`
  - 状态: "Study & Learn" 和 "Web Search" 模式有完整的 UI（选择、展示、取消），但 `mode` 值没有传递给 `send()` 或任何 API 调用，选择后无实际效果。

  // 暂时不管

- [ ] **反馈功能未接入后端**
  - 文件: `AssistantMessage.tsx:28,37-39`
  - 状态: 点赞/点踩使用 `useState` 管理，纯前端状态，刷新即丢失。没有对应的 API 调用将反馈发送给后端。

  // 暂时不管

### P2

- [ ] **文件上传功能未完成**
  - 文件: `ChatInput/PlusMenu.tsx`
  - 状态: PlusMenu 有 "Upload File" 选项和隐藏的 file input，但选择文件后的处理逻辑（上传、关联消息）未实现。

// 暂时不管。
