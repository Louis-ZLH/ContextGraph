import { queryClient } from "../../query";
import { canvasListQueryOptions } from "../../query/canvas";
import { toast } from "react-hot-toast";
import { getCanvasDetail, syncCanvas } from "../../service/canvas";
import { redirect, type LoaderFunctionArgs } from "react-router";
import { store } from "../../store";
import { loadCanvas, consumeDelta } from "../../feature/canvas/canvasSlice";
import type { GraphDelta } from "../../feature/canvas/types";

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
        d.deletedEdgesId.length === 0
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

    // 切换画布前先 flush 旧的未同步变更
    await flushPendingDelta();

    const { success, message, data: canvasDetail } = await getCanvasDetail(canvasId);
    if(!success || !canvasDetail) {
        toast.error(message);
        return redirect("/canvas");
    }
    store.dispatch(loadCanvas({
        canvasId: canvasDetail.canvasId,
        title: canvasDetail.title,
        nodes: canvasDetail.nodes,
        edges: canvasDetail.edges,
        version: canvasDetail.version,
    }));
    return null;
}