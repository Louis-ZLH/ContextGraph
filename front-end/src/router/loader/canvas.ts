import { queryClient } from "../../query";
import { canvasListQueryOptions } from "../../query/canvas";
import { toast } from "react-hot-toast";
import { getCanvasDetail, syncCanvas } from "../../service/canvas";
import { redirect, type LoaderFunctionArgs } from "react-router";
import { store } from "../../store";
import { loadCanvas, consumeDelta } from "../../feature/canvas/canvasSlice";
import { getInflightSyncPromise } from "../../feature/canvas/useSyncCanvas";
import type { GraphDelta } from "../../feature/canvas/types";
import { convertBackendNodeToNode } from "../../service/canvas";
import { getConversationList } from "../../service/canvas";
import { loadConversations } from "../../feature/chat/chatSlice";
import type { Conversation } from "../../feature/chat/types";

export async function canvasLayoutLoader(){
    try{
        const { success, data: canvasListInfo } = await queryClient.ensureQueryData(canvasListQueryOptions);
        if(!success || !canvasListInfo) {
            toast.error("Failed to get canvas list");
        }
        return null;
    } catch (error: unknown) {
        if (error instanceof Error) {
            toast.error(error.message);
        }
        toast.error("Failed to get canvas list");
    }
}

function isDeltaEmpty(d: GraphDelta) {
    return (
        d.createdNodes.length === 0 &&
        d.updatedNodes.length === 0 &&
        d.deletedNodesId.length === 0 &&
        d.createdEdges.length === 0 &&
        d.deletedEdges.length === 0
    );
}

// 在加载新画布前，先把旧画布的 pending delta flush 到服务器
async function flushPendingDelta() {
    const { canvas } = store.getState() as { canvas: { canvasId: string | null; pendingDelta: GraphDelta; version: number } };
    if (!canvas.canvasId || isDeltaEmpty(canvas.pendingDelta)) return;

    const snapshot = structuredClone(canvas.pendingDelta);
    store.dispatch(consumeDelta());

    try {
        await syncCanvas(canvas.canvasId, snapshot, canvas.version);
    } catch {
        // best-effort：不阻塞导航
    }
}

// 获取画布数据
export async function canvasLoader({ params }: LoaderFunctionArgs){
    const canvasId = params.canvas_id;
    if(!canvasId) {
        return redirect("/canvas");
    }

    // Wait for any in-flight sync from unmount cleanup before fetching
    const inflight = getInflightSyncPromise();
    if (inflight) await inflight;

    const [,conversationRes, canvasRes] = await Promise.all([
        flushPendingDelta(),
        getConversationList(canvasId),
        getCanvasDetail(canvasId),
    ]);

    if(!conversationRes.success || !conversationRes.data) {
        toast.error(conversationRes.message);
        return redirect("/canvas");
    }
    if(!canvasRes.success || !canvasRes.data) {
        toast.error(canvasRes.message);
        return redirect("/canvas");
    }

    store.dispatch(loadConversations(conversationRes.data as Conversation[]));
    store.dispatch(loadCanvas({
        canvasId: canvasRes.data.canvasId,
        title: canvasRes.data.title,
        nodes: canvasRes.data.nodes.map(convertBackendNodeToNode),
        edges: canvasRes.data.edges,
        version: canvasRes.data.version,
    }));
    return null;
}