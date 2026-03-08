# Sidebar Toggle Performance Fix

## Problem

Toggling the sidebar causes ~193ms render frames (21 commits during 300ms CSS transition).
Profiler shows: "What caused this update?" -> ChatNode x4, NodeWrapper.

## Root Cause Analysis

### Chain of events:

1. Sidebar has `transition-[width] duration-300 ease-in-out` -> ~20 reflows over 300ms
2. Each reflow resizes the ReactFlow container
3. ReactFlow's internal Zustand store updates (`width`, `height`)
4. If any node DOM element resizes during this (e.g. maximized node using CSS variables), ReactFlow fires `onNodesChange` with "dimensions" changes
5. `handleNodesChange` in `view/canvas/index.tsx` dispatches `interactiveNodeUpdate` to Redux
6. `interactiveNodeUpdate` reducer: `state.nodes = applyNodeChanges(...)` creates **new array reference**
7. `useChatStream` subscribes to `state.canvas.nodes` via `useAppSelector` -> sees new reference -> hook re-renders
8. `send` callback is recreated (because `canvasNodes` is in dependency array)
9. `stream` useMemo sees new `send` reference -> creates new object
10. `streamContext.Provider` pushes new value -> ALL children re-render
11. 4 ChatNodes x ~50ms each = ~200ms per commit

### Additionally:

Even without `interactiveNodeUpdate` dispatch, the 3 `useAppSelector` calls in `useChatStream` are reactive subscriptions to Redux store values (`pendingDelta`, `canvasNodes`, `conversationTitle`) that are **only used inside the `send` callback** (user-initiated action). They should be lazy reads instead of reactive subscriptions.

---

## Fix 1: `useChatStream.ts` - Remove unnecessary reactive subscriptions

**File:** `src/feature/chat/useChatStream.ts`

### Change imports (line 1, 6):

```diff
-import { useDispatch } from "react-redux";
+import { useDispatch, useStore } from "react-redux";

-import { useAppSelector } from "../../hooks";
+import type { RootState } from "../../store";
```

### Remove reactive selectors, add lazy store access (lines 14-17):

```diff
 export function useChatStream(conversationId: string) {
     const dispatch = useDispatch();
-    const pendingDelta = useAppSelector(state => state.canvas.pendingDelta);
-    const canvasNodes = useAppSelector(state => state.canvas.nodes);
-    const conversationTitle = useAppSelector(state => state.chat.conversations[conversationId]?.title);
+    const store = useStore<RootState>();
     const controllerRef = useRef<AbortController | null>(null);
```

### Inside `send` callback, read state lazily (line 55+):

```diff
     const send = useCallback((content: string | null, model: number, parentId: string, isRetry: boolean = false, UserMsgId: string | null = null)=>{
+        // Read state lazily at call time (not reactively) to avoid re-renders
+        const { canvas: { pendingDelta, nodes: canvasNodes }, chat } = store.getState();
+        const conversationTitle = chat.conversations[conversationId]?.title;

         //stop();
         sendSignalRef.current += 1;
```

### Update dependency array (line 187):

```diff
-    },[dispatch, conversationId, flushTokenBuffer, pendingDelta, canvasNodes, conversationTitle])
+    },[dispatch, conversationId, flushTokenBuffer, store])
```

**Why this works:** `pendingDelta`, `canvasNodes`, and `conversationTitle` are only used inside the `send` callback body (called on user action, not during render). By reading them lazily via `store.getState()`, we eliminate 3 Redux subscriptions from every ChatNode instance. When Redux state changes (e.g. from `interactiveNodeUpdate`), ChatNode no longer re-renders.

---

## Fix 2: `Sidebar.tsx` - Remove CSS width transition

**File:** `src/ui/layout/Sidebar.tsx` (line 42)

```diff
     <aside
       className={`${
         isOpen ? "w-64" : "w-16"
-      } relative flex flex-col border-r border-main bg-sidebar z-20 transition-[width] duration-300 ease-in-out overflow-hidden whitespace-nowrap`}
+      } relative flex flex-col border-r border-main bg-sidebar z-20 overflow-hidden whitespace-nowrap`}
     >
```

**Why this works:** Removing the 300ms width transition makes the sidebar width change instant. Instead of ~20 layout reflows during the animation, there's only 1 reflow. The sidebar already has `transition-opacity duration-300` on its inner content (collapsed/expanded states), so the toggle still has visual feedback.

**Note:** If you prefer to keep some animation, you can use a very short transition like `transition-[width] duration-75` (75ms = ~5 reflows instead of ~20). But with Fix 1 applied, even the full 300ms transition should be smooth because ChatNodes no longer re-render during resize.

---

## Priority

- **Fix 1 is the most impactful** - It eliminates the ~193ms render cost per commit by preventing ChatNode cascade re-renders entirely. With Fix 1 alone, the 21 commits during sidebar transition would each take ~5ms instead of ~193ms.
- **Fix 2 is a safety net** - It reduces 21 commits to 1, further reducing total render work. Apply if Fix 1 alone isn't sufficient.

## How to verify

1. Open React DevTools Profiler
2. Start recording
3. Toggle the sidebar
4. Stop recording
5. Check: ChatNode should NOT appear in "What caused this update?" anymore
6. Each commit should be <16ms (60fps budget)
