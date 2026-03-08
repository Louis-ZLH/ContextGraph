# Chat 发送时携带 Canvas 上下文变更 — 架构设计 & TODO Plan

## 一、整体目标

解决 Chat 发送消息时，AI 无法感知前端尚未同步到后端的 Canvas 图变更的问题。当用户在 Canvas 上新增/删除了 edge（改变了 ChatNode 的父节点关系），然后立刻发送消息，由于 `useSyncCanvas` 有 2s debounce，后端 DB 中的 `node_edges` 可能还是旧状态，导致 AI 上下文组装遗漏或多余了父节点。

**核心思路**：前端在发送 Chat 请求时，计算出 ChatNode 的父节点变更（新增了哪些、删除了哪些），以预处理后的精简数据附带在请求中。后端基于 DB 状态 + 前端传来的变更增量，组装出准确的 AI 上下文。

---

## 二、核心设计决策

### 2.1 方案选型：前端预处理 vs 传原始 Delta

| 方案 | 描述 | 优缺点 |
|------|------|--------|
| **A. send 消费 delta** | send() 内 dispatch(consumeDelta())，将 delta 持久化交给 chat 请求 | send 和 sync 竞态、delta 消费后请求失败需回滚，复杂度高 |
| **B. send 携带只读 snapshot** | send() 只读 pendingDelta 的 snapshot，不消费，sync 照常运行 | 两条路径解耦，但后端需要实现完整的 delta 合并逻辑 |
| **C. 前端预处理为 parent 变更（采用）** | 前端从 delta 中计算出 new/deleted parent 节点，只传两个数组 | chat API 不需要理解 canvas delta 语义，后端逻辑极简 |

**选择方案 C**，理由：

1. **关注点分离**：Chat API 只关心"上下文节点集合变了谁"，不关心节点坐标、edge 结构、delta 冲突合并规则
2. **前端计算成本低**：Redux 里已有完整的 `nodes`、`edges` 和 `pendingDelta`，计算 parent 变更是纯内存操作
3. **后端逻辑极简**：`context_nodes = db_parents + new_parents - deleted_parents`，无需实现 delta 合并
4. **解耦彻底**：delta 格式变化不影响 chat API，chat API 变化不影响 sync 流程

### 2.2 send 与 sync 完全解耦

```
send() → 只读 pendingDelta 计算 parent 变更，不 dispatch consumeDelta()
useSyncCanvas → 照常 debounce 2s → consumeDelta → syncCanvas

两条路径完全独立，不存在竞态。
```

**snapshot 和 sync 可能重复到达后端**：这是正常情况。send 携带的 parent 变更仅用于内存中的上下文组装，不写库。持久化全交给 sync 路径。即使 sync 比 chat 请求更早到达，后端按 DB 最新状态 + parent 变更组装也不会出错（因为 new_parents 中已存在于 DB 的节点只是多查了一次，deleted_parents 中已不存在的节点跳过即可）。

### 2.3 传输数据结构设计

**前端传给后端：**

```typescript
// new_parent_nodes: 完整 Node 数据，解决新建节点尚未 sync 到 DB 的边界情况
// deleted_parent_node_ids: 只传 ID，被删除的父节点必然已存在于 DB

interface ParentNodeDelta {
  new_parent_nodes: DTONodeReadyToSend[];   // 新增的父节点（完整数据）
  deleted_parent_node_ids: string[];         // 删除的父节点 ID
}
```

**为什么 new 传完整 Node 而 delete 只传 ID：**

- **new_parent_nodes 传完整数据**：新增的父节点(主要是resourceNode，chatNode新建的没有任何信息含量)可能是刚创建还没 sync 的，后端 DB 中查不到。传完整数据后，后端可以直接使用，不依赖 DB 中是否已存在。如果 sync 已经先到了，后端通过 ID 查到了 DB 中的数据，用 DB 数据即可，忽略前端传来的（DB 为准）
- **deleted_parent_node_ids 只传 ID**：要删除的父节点一定是之前已存在的，后端只需要从上下文集合中排除这些 ID

### 2.4 前端计算 parent 变更的逻辑 ✅ 已实现

> 实现位于 `front-end/src/feature/canvas/canvasOps.ts` → `computeParentDelta()`
> 单元测试位于 `front-end/src/feature/canvas/canvasOps.test.ts`（7 cases）

### 2.5 后端处理逻辑

```
收到 SendMessage 请求:
{
  conversation_id, content, model, parent_id,
  new_parent_nodes?: [],       // 可选字段
  deleted_parent_node_ids?: [] // 可选字段
}

上下文组装时:
1. 从 node_edges 查询 ChatNode 的所有父节点 ID（DB 已持久化的）
2. 加上 new_parent_nodes 中的节点（如果 ID 已在 DB 中存在，用 DB 数据；否则用前端传来的数据）
3. 减去 deleted_parent_node_ids 中的 ID
4. 对最终的父节点集合，按类型获取上下文：
   - ChatNode → node summary
   - ResourceNode → 文件内容
5. 组装完整 prompt，发给 AI
```

### 2.6 Retry 请求同样携带 parent 变更

`isRetry = true` 时也需要携带 parent 变更，理由：
- 用户可能**因为修改了 canvas 上下文才触发 retry**（例如：添加了一个 resource 节点作为参考，希望 AI 基于新上下文重新生成）
- 后端 `RetryMessage` 会重新调用 `buildMessageChain` 重新组装上下文，并不复用上次的 prompt，所以 parent 集合也应该重新计算
- 从实现上看，retry 和 send 共享同一个 `computeParentDelta()` 计算逻辑，统一处理反而更简单

### 2.7 幂等性与容错

| 场景 | 行为 | 结果 |
|------|------|------|
| new_parent_nodes 中的节点已被 sync 到 DB | 后端按 ID 查到了 DB 数据，忽略前端传来的 | 正确，DB 数据为准 |
| new_parent_nodes 中的节点尚未 sync | 后端查不到，使用前端传来的完整数据组装上下文 | 正确，AI 能看到最新父节点 |
| deleted_parent_node_ids 中的 edge 已被 sync 删除 | 后端 DB 中已没有该 parent，减去操作无副作用 | 正确，幂等 |
| send 和 sync 同时到达 | sync 写库、send 只读，互不干扰 | 正确，无竞态 |
| send 失败 | delta 没有被消费，sync 照常处理 | 正确，无数据丢失 |
| 用户发送后立刻修改了 canvas | send 使用的是发送那一刻的 snapshot，后续修改走 sync | 正确，AI 基于发送时刻的状态回答是合理的 |

---

## 三、接口变更

### 3.1 前端 → 后端：SendMessage 请求

**现有结构：**
```json
{
  "conversation_id": "abc123",
  "content": "帮我分析一下这些节点的关系",
  "model": 1,
  "parent_id": "987654321"
}
```

**新增字段：**
```json
{
  "conversation_id": "abc123",
  "content": "帮我分析一下这些节点的关系",
  "model": 1,
  "parent_id": "987654321",
  "new_parent_nodes": [
    {
      "id": "node_abc",
      "type": "resourceNode",
      "position": {"x": 100, "y": 200},
      "file_id": "12345"
    }
  ],
  "deleted_parent_node_ids": ["node_xyz"]
}
```

**Retry 请求同样新增这两个字段。**

### 3.2 后端 DTO 变更

```go
// dto/chat.go

// 两个请求共用的 parent 变更字段，抽为嵌入结构
type ParentDelta struct {
    NewParentNodes       []ParentNode `json:"new_parent_nodes,omitempty"`
    DeletedParentNodeIDs []string     `json:"deleted_parent_node_ids,omitempty"`
}

type SendMessageRequest struct {
    ConversationID string `json:"conversation_id" binding:"required"`
    ParentID       int64  `json:"parent_id,string" binding:"required"`
    Content        string `json:"content" binding:"required"`
    Model          int    `json:"model"`
    ParentDelta           // 嵌入
}

type RetryMessageRequest struct {
    ConversationID string `json:"conversation_id" binding:"required"`
    UserMsgID      int64  `json:"user_msg_id,string" binding:"required"`
    Model          int    `json:"model"`
    ParentDelta           // 嵌入
}

type ParentNode struct {
    ID       string  `json:"id" binding:"required"`
    Type     string  `json:"type" binding:"required,oneof=chatNode resourceNode"`
    Position dto.Pos `json:"position"`
    FileID   *int64  `json:"file_id,string,omitempty"`
}
```

### 3.3 前端 Service 层变更

```typescript
// service/chat.ts - sendMessageStream

// parent 变更字段（send 和 retry 共用）
const parentDeltaFields = {
    ...(newParentNodes.length > 0 && { new_parent_nodes: newParentNodes }),
    ...(deletedParentNodeIds.length > 0 && { deleted_parent_node_ids: deletedParentNodeIds }),
};

// body 构造部分改为：
const body = isRetry
    ? { conversation_id: conversationId, user_msg_id: userMsgId, model, ...parentDeltaFields }
    : {
        conversation_id: conversationId,
        content,
        model,
        parent_id: parentId,
        ...parentDeltaFields,
      };
```

### 3.4 前端 Hook 层变更

```typescript
// feature/chat/useChatStream.ts

// send 函数新增 chatNodeId 参数（用于计算当前 ChatNode 的 parent 变更）
// 内部通过 useAppSelector 读取 pendingDelta、edges、nodes
// 调用 computeParentDelta() 计算变更
// 将结果传给 sendMessageStream()

const send = useCallback((
  content: string | null,
  model: number,
  parentId: string,
  isRetry: boolean = false,
  UserMsgId: string | null = null,
) => {
    // ... 现有逻辑 ...

    // 计算 parent 变更（send 和 retry 均计算）
    const { newParentNodes, deletedParentNodeIds } =
        computeParentDelta(chatNodeId, pendingDelta, edges, nodes);

    // 传给 sendMessageStream
    controllerRef.current = sendMessageStream(
        conversationId, content, model, parentId,
        isRetry, UserMsgId,
        newParentNodes, deletedParentNodeIds,  // 新增参数
        callbacks,
    );
}, [...]);
```

---

## 四、TODO 清单

### ~~Phase 1：前端 — 计算 Parent 变更~~ ✅ 已完成

> `computeParentDelta()` 已实现于 `front-end/src/feature/canvas/canvasOps.ts`，单元测试位于 `canvasOps.test.ts`（7 cases all passed）。

### Phase 2：前端 — 修改 Chat 发送链路

- [x] 修改 `sendMessageStream()` 函数签名，新增 `newParentNodes` 和 `deletedParentNodeIds` 参数
- [x] 修改 `sendMessageStream()` 内 body 构造逻辑，send 和 retry 均在数组非空时附带新字段
- [x] 修改 `useChatStream` hook：
  - 通过 `useAppSelector` 读取 `pendingDelta`、`edges`、`nodes`
  - 在 `send()` 中调用 `computeParentDelta()` 获取变更（send 和 retry 统一计算）
  - 将结果传给 `sendMessageStream()`
- [x] 确保 `convertNodeToSendStructure` 转换应用于 `newParentNodes`，保持和 syncCanvas 一致的数据格式

### Phase 3：后端 — DTO & Handler 层

- [x] 修改 `dto.SendMessageRequest`，新增 `NewParentNodes` 和 `DeletedParentNodeIDs` 字段
- [x] 新增 `dto.ParentDelta` 嵌入结构和 `dto.ParentNode` 结构体
- [x] 修改 `dto.RetryMessageRequest`，嵌入 `ParentDelta`
- [x] Handler 层无需改动（`ShouldBindJSON` 自动解析新字段），但需验证空数组和 nil 的兼容性

### Phase 4：后端 — Service 层上下文组装

- [x] 修改 `ConversationService.SendMessage()` 和 `RetryMessage()` 方法，通过 `req` 中的 `ParentDelta` 传递 parent 变更数据
- [x] 在上下文组装阶段（`buildMessageChain` 之前或之后），实现 parent 变更的合并逻辑：
  - 从 `node_edges` 查询当前 ChatNode 的所有父节点
  - 将 `new_parent_nodes` 中的节点加入上下文集合（优先使用 DB 数据，DB 查不到则使用前端传来的数据）
  - 从上下文集合中排除 `deleted_parent_node_ids`

（先完成file_analysis → summary → 回来实现 Phase 4 的 resolveParentContext）
- [x] 封装 `resolveParentContext()` 方法，统一处理 DB 查询 + delta 合并逻辑
- [x] 确保 `new_parent_nodes` 为空和字段缺失时的向后兼容性（走原有逻辑）

### Phase 5：测试 & 边界情况

- [ ] 端到端测试：无 delta 时发送消息，行为与改动前完全一致
- [ ] 端到端测试：新增 edge 后立刻发消息，AI 能看到新 parent 的上下文
- [ ] 端到端测试：删除 edge 后立刻发消息，AI 不再看到被删 parent 的上下文
- [ ] 边界测试：new_parent_nodes 中的节点 sync 已先到达 DB → 不重复、不冲突
- [ ] 边界测试：send 请求失败 → pendingDelta 未受影响，sync 正常运行
- [ ] 端到端测试：retry 时修改了 canvas parent 关系，AI 基于新上下文重新生成
- [ ] 向后兼容测试：旧版前端不传新字段 → 后端正常运行

---

## 五、关键设计决策记录

| 决策项 | 选择 | 理由 |
|--------|------|------|
| **send 与 sync 的关系** | 完全解耦，send 不消费 delta | 避免竞态、回滚等复杂逻辑，两条路径互不干扰 |
| **传输数据格式** | 预处理后的 parent 变更（而非原始 delta） | Chat API 不需要理解 canvas delta 语义，后端逻辑极简 |
| **new_parent 传完整 Node** | 完整数据而非仅 ID | 解决新建节点尚未 sync 到 DB 的边界情况，后端不依赖 DB 中是否已存在 |
| **deleted_parent 只传 ID** | 仅 string[] | 被删除的父节点一定已存在于 DB，ID 足够标识 |
| **Retry 同样携带 parent 变更** | Send 和 Retry 统一处理 | 用户可能因修改了 canvas 上下文才触发 retry；后端 RetryMessage 会重新组装上下文，parent 集合也应重新计算 |
| **后端不写库** | parent 变更仅用于内存中的上下文组装 | 持久化全交给 sync 路径，职责分离 |
| **幂等性设计** | DB 有则用 DB、DB 无则用前端数据 | 不管 sync 是否先到达，结果都正确 |
| **前端计算位置** | useChatStream hook 内部 | 调用方无感知，hook 内部通过 useAppSelector 读取所需数据 |
| **Node 格式转换** | 复用 convertNodeToSendStructure | 保持和 syncCanvas 一致的后端数据格式 |
