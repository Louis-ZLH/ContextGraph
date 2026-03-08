import { describe, it, expect } from "vitest";
import { computeParentDelta, emptyDelta } from "./canvasOps";
import type { Node, Edge, GraphDelta } from "./types";

/* ── helpers ── */

const makeNode = (id: string, type: "chatNode" | "resourceNode" = "resourceNode"): Node => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data: {},
});

const makeEdge = (id: string, source: string, target: string): Edge => ({
  id,
  source,
  target,
  type: "custom-edge",
});

const CHAT_NODE_ID = "chat-1";

/* ── tests ── */

describe("computeParentDelta", () => {
  it("delta 为空 → 两个数组均为空", () => {
    const nodes = [makeNode(CHAT_NODE_ID, "chatNode")];
    const delta = emptyDelta();

    const result = computeParentDelta(CHAT_NODE_ID, delta, nodes);

    expect(result.newParentNodes).toEqual([]);
    expect(result.deletedParentNodeIds).toEqual([]);
  });

  it("新增了一条指向当前 chatNode 的 edge → newParentNodes 包含对应节点", () => {
    const parentNode = makeNode("res-1");
    const nodes = [makeNode(CHAT_NODE_ID, "chatNode"), parentNode];
    const delta: GraphDelta = {
      ...emptyDelta(),
      createdEdges: [makeEdge("e-1", "res-1", CHAT_NODE_ID)],
    };

    const result = computeParentDelta(CHAT_NODE_ID, delta, nodes);

    expect(result.newParentNodes).toEqual([parentNode]);
    expect(result.deletedParentNodeIds).toEqual([]);
  });

  it("删除了一条指向当前 chatNode 的 edge → deletedParentNodeIds 包含对应 source ID", () => {
    const nodes = [makeNode(CHAT_NODE_ID, "chatNode")];
    const delta: GraphDelta = {
      ...emptyDelta(),
      deletedEdges: [makeEdge("e-1", "res-1", CHAT_NODE_ID)],
    };

    const result = computeParentDelta(CHAT_NODE_ID, delta, nodes);

    expect(result.newParentNodes).toEqual([]);
    expect(result.deletedParentNodeIds).toEqual(["res-1"]);
  });

  it("新增了节点 + edge（全新 parent）→ newParentNodes 包含完整节点数据", () => {
    const newParent = makeNode("res-new");
    // 新节点已被 applyOps 加入 state.nodes
    const nodes = [makeNode(CHAT_NODE_ID, "chatNode"), newParent];
    const delta: GraphDelta = {
      ...emptyDelta(),
      createdNodes: [newParent],
      createdEdges: [makeEdge("e-new", "res-new", CHAT_NODE_ID)],
    };

    const result = computeParentDelta(CHAT_NODE_ID, delta, nodes);

    expect(result.newParentNodes).toEqual([newParent]);
    expect(result.deletedParentNodeIds).toEqual([]);
  });

  it("删除了一个父节点（node + edge 一起删除，级联 deletedEdges 自动覆盖）", () => {
    // 节点被删后，级联已将关联 edge 放入 deletedEdges
    const nodes = [makeNode(CHAT_NODE_ID, "chatNode")];
    const delta: GraphDelta = {
      ...emptyDelta(),
      deletedNodesId: ["res-del"],
      deletedEdges: [makeEdge("e-del", "res-del", CHAT_NODE_ID)],
    };

    const result = computeParentDelta(CHAT_NODE_ID, delta, nodes);

    expect(result.newParentNodes).toEqual([]);
    expect(result.deletedParentNodeIds).toEqual(["res-del"]);
  });

  it("混合操作 → 两个数组均正确", () => {
    const newParent = makeNode("res-add");
    const nodes = [makeNode(CHAT_NODE_ID, "chatNode"), newParent];
    const delta: GraphDelta = {
      ...emptyDelta(),
      createdEdges: [makeEdge("e-add", "res-add", CHAT_NODE_ID)],
      deletedEdges: [makeEdge("e-rm", "res-rm", CHAT_NODE_ID)],
    };

    const result = computeParentDelta(CHAT_NODE_ID, delta, nodes);

    expect(result.newParentNodes).toEqual([newParent]);
    expect(result.deletedParentNodeIds).toEqual(["res-rm"]);
  });

  it("不相关的 edge 变更不影响结果", () => {
    const nodes = [
      makeNode(CHAT_NODE_ID, "chatNode"),
      makeNode("chat-2", "chatNode"),
      makeNode("res-1"),
    ];
    const delta: GraphDelta = {
      ...emptyDelta(),
      // 这条 edge 指向另一个 chatNode，不应影响 chat-1 的结果
      createdEdges: [makeEdge("e-other", "res-1", "chat-2")],
      deletedEdges: [makeEdge("e-other-del", "res-1", "chat-2")],
    };

    const result = computeParentDelta(CHAT_NODE_ID, delta, nodes);

    expect(result.newParentNodes).toEqual([]);
    expect(result.deletedParentNodeIds).toEqual([]);
  });
});
