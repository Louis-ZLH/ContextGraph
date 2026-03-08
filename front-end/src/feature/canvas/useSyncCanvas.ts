import { useEffect, useRef, useCallback } from "react";
import { useAppSelector, useAppDispatch } from "../../hooks";
import {
  consumeDelta,
  syncSuccess,
  syncError,
  startFullSync,
  replaceFromServer,
  fullSyncDone,
  type GraphDelta,
} from "./canvasSlice";
import { syncCanvas, fullSyncCanvas, getCanvasDetail, getCanvasVersion, convertBackendNodeToNode } from "../../service/canvas";
import toast from "react-hot-toast";
import type { syncResponse } from "../../service/type";

function isDeltaEmpty(d: GraphDelta) {
  return (
    d.createdNodes.length === 0 &&
    d.updatedNodes.length === 0 &&
    d.deletedNodesId.length === 0 &&
    d.createdEdges.length === 0 &&
    d.deletedEdges.length === 0
  );
}

// Module-level: track the in-flight sync promise so the loader can await it
// eslint-disable-next-line prefer-const
let inflightSyncPromise: Promise<void> | null = null;
export function getInflightSyncPromise() {
  return inflightSyncPromise;
}

export function useSyncCanvas() {
  const dispatch = useAppDispatch();

  const pendingDelta = useAppSelector((s) => s.canvas.pendingDelta);
  const syncStatus = useAppSelector((s) => s.canvas.syncStatus);
  const syncFailCount = useAppSelector((s) => s.canvas.syncFailCount);
  const canvasId = useAppSelector((s) => s.canvas.canvasId);
  const version = useAppSelector((s) => s.canvas.version);
  const nodes = useAppSelector((s) => s.canvas.nodes);
  const edges = useAppSelector((s) => s.canvas.edges);
  // ---- 从后端拉取最新数据替换本地 ----
  const fetchAndReplace = useCallback(async (cid: string) => {
    dispatch(startFullSync());
    try {
      const { success, data } = await getCanvasDetail(cid);
      if (!success || !data) throw new Error("Failed to fetch canvas");
      dispatch(replaceFromServer({ nodes: data.nodes.map(convertBackendNodeToNode), edges: data.edges, version: data.version }));
    } catch {
      toast.error("Failed to fetch latest canvas from server");
      dispatch(fullSyncDone({ version, updatedAt: "" }));
    }
  }, [dispatch, version]);

  // ---- debounced sync ----
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSync = useCallback(async () => {
    if (isDeltaEmpty(pendingDelta) || !canvasId) return;
  
    const snapshot = structuredClone(pendingDelta);
    dispatch(consumeDelta());
  
    try {
      // await api.syncDelta(canvasId, snapshot);
      const { success, message, data, code } = await syncCanvas(canvasId, snapshot, version);
      if (code === 409) { // conflict
        toast.error(message);
        await fetchAndReplace(canvasId);
        return;
      }
      if (!success) {
        throw new Error(message);
      }
      dispatch(syncSuccess(data as syncResponse));
    } catch {
      dispatch(syncError());
    }
  }, [dispatch, canvasId, pendingDelta, version, fetchAndReplace]);

  // Keep a ref to the latest doSync so the unmount effect can call it
  const doSyncRef = useRef(doSync);
  useEffect(() => {
    doSyncRef.current = doSync;
  }, [doSync]);

  // 每次 pendingDelta 变化 → 重置 debounce 计时器
  useEffect(() => {
    if (isDeltaEmpty(pendingDelta) || syncStatus !== "idle") return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(doSync, 2000); // 2s debounce

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [pendingDelta, syncStatus, doSync]);

  // Flush pending delta on unmount (e.g. route change) to avoid data loss
  useEffect(() => {
    return () => {
      inflightSyncPromise = doSyncRef.current();
    };
  }, []);

  // ---- 失败 N 次后全量同步 ----
  useEffect(() => {
    if (!canvasId) return;
    if (syncFailCount < 3) return;

    async function fullSync() {
      try {
        // const { nodes, edges } = await api.fullSync(canvasId);
        // dispatch(replaceFromServer({ nodes, edges }));
        const { success, message, data, code } = await fullSyncCanvas(canvasId as string, nodes, edges, version);
        if (code === 409) { // conflict
          toast.error(message);
          await fetchAndReplace(canvasId as string);
          return;
        }
        if (!success) {
          throw new Error(message);
        }
        if (!data) {
          throw new Error("Failed to full sync canvas");
        }
        dispatch(fullSyncDone(data));
      } catch {
        // 全量也失败了，可以提示用户
        toast.error("Failed to connect to server, please try again later.");
      }
    }
    fullSync();
  }, [syncFailCount, canvasId, version, nodes, edges, dispatch, fetchAndReplace]);


  // 页面焦点检查：窗口获得焦点 或 tab 切回时检查版本
  useEffect(() => {
    if (!canvasId) return;

    const checkVersion = async () => {
      const { success, data } = await getCanvasVersion(canvasId);
      if (!success || !data) return;
      if (data.version > version) {
        toast.error("Version mismatch");
        await fetchAndReplace(canvasId);
      }
    };

    const onFocus = () => checkVersion();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkVersion();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [canvasId, version, fetchAndReplace]);

}