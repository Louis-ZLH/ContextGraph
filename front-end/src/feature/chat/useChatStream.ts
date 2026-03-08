import { useDispatch, useStore } from "react-redux";
import { sendMessageStream } from "../../service/chat";
import type { Message } from "./types";
import { addUserMessage, addAssistantPlaceholder, confirmUserMessage, confirmAssistantMessage, removeAssistantPlaceholder, appendStreamToken, completeStream, errorStream, abortStream, errorUserMessage, updateWaitingStatus, updateConversationTitle } from "./chatSlice";
import { useRef, useCallback, useState } from "react";
import type { RootState } from "../../store";
import { computeParentDelta } from "../canvas/canvasOps";
import { convertNodeToSendStructure } from "../../service/canvas";
import toast from "react-hot-toast";

// 定时批处理：攒 token，每 100ms dispatch 一次（~10次/秒）
const FLUSH_INTERVAL = 50;

export function useChatStream(conversationId: string) {
    const dispatch = useDispatch();
    const store = useStore<RootState>();
    const controllerRef = useRef<AbortController | null>(null);
    const [isStreaming, setIsStreaming] = useState(false);
    const tokenBufRef = useRef("");
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const streamCtxRef = useRef<{ UserMsgId: string; msgId: string } | null>(null);
    const confirmUserMsgRef = useRef<{ tempMsgId: string | null; msgId: string | null; assistantMsgId: string } | null>(null);
    const sendSignalRef = useRef(0); // 每次 send 递增，供 MessageList 判断是否需要滚动
    const hasStatusTextRef = useRef(false); // 追踪 statusText 是否存在，避免每个 token 都 dispatch

    const flushTokenBuffer = useCallback(() => {
        if (timerRef.current !== null) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (tokenBufRef.current && streamCtxRef.current) {
            dispatch(appendStreamToken({
                msgId: streamCtxRef.current.msgId,
                token: tokenBufRef.current,
            }));
            tokenBufRef.current = "";
        }
    }, [dispatch]);

    const stop = useCallback(() => {
        if (controllerRef.current) {
            controllerRef.current.abort();
            controllerRef.current = null;
            setIsStreaming(false);
        }
        flushTokenBuffer();
    }, [flushTokenBuffer])
    /*
        输出流的时候会从UI层面禁止重新发送。（发送按钮从发送样式变成取消样式）

        有一种情况：用户发送后，当前分支A流式正在输出，但是用户通过修改content尝试重新发送创建新branch B，
        此时应该先abort branch A正在输出的流，然后再执行branch B的逻辑流。
    */
    const send = useCallback((content: string | null, model: number, parentId: string, isRetry: boolean = false, UserMsgId: string | null = null)=>{
        // Read state lazily at call time (not reactively) to avoid re-renders
        const { canvas: { pendingDelta, nodes: canvasNodes }, chat } = store.getState();
        const conversationTitle = chat.conversations[conversationId]?.title;

        //stop(); // 先停止当前正在输出的流, 每个对话只允许一个流式输出
        sendSignalRef.current += 1; // 通知 MessageList 需要滚动
        streamCtxRef.current = null; // 重置流上下文，用于判断首个 token 是否到达
        confirmUserMsgRef.current = null;
        hasStatusTextRef.current = false;
        setIsStreaming(true);

        // 计算未同步的父节点变更
        const { newParentNodes, deletedParentNodeIds } = computeParentDelta(conversationId, pendingDelta, canvasNodes);
        const dtoParentNodes = newParentNodes.map(convertNodeToSendStructure);

        let tempMsgId: string | null = null;
        if(!isRetry) {
            tempMsgId = crypto.randomUUID();
            // 乐观写入user message
            dispatch(addUserMessage({ conversationId, msgId: tempMsgId, parentId, content: content || "", model }));
        }
        // 乐观写入 assistant 占位消息
        const tempAsstId = crypto.randomUUID();
        const placeholderParentId = isRetry ? UserMsgId! : tempMsgId!;
        dispatch(addAssistantPlaceholder({ conversationId, msgId: tempAsstId, parentId: placeholderParentId, model }));
        // 创建流
        const generateTitle = !conversationTitle && !isRetry;
        controllerRef.current = sendMessageStream(conversationId, content, model, parentId, isRetry, UserMsgId, dtoParentNodes, deletedParentNodeIds, generateTitle, {
            onUserMessage: (message: Message, assistantMsgId: string) => {
                if(!tempMsgId) return;
                confirmUserMsgRef.current = { tempMsgId, msgId: message.id, assistantMsgId };
            },
            onRetryAck: (assistantMsgId: string) => {
                confirmUserMsgRef.current = { tempMsgId: null, msgId: null, assistantMsgId };
            },
            onToken: (token: string, UserMsgId: string, messageId: string) => {
                // 首个 token 到达：将 placeholder 的 tempId 替换为后端真实 id
                if (!streamCtxRef.current) {
                    if(confirmUserMsgRef.current) {
                        const { tempMsgId: uTempId, msgId: uRealId } = confirmUserMsgRef.current;
                        if (uTempId && uRealId) {
                            dispatch(confirmUserMessage({ conversationId, tempMsgId: uTempId, msgId: uRealId }));
                        }
                    }
                    dispatch(confirmAssistantMessage({ conversationId, tempMsgId: tempAsstId, msgId: messageId }));
                }
                streamCtxRef.current = { UserMsgId, msgId: messageId };
                // tool_call 后首个 token 到达时清除 statusText，同时直接 flush 避免空白闪烁
                if (hasStatusTextRef.current) {
                    dispatch(updateWaitingStatus({ msgId: messageId, statusText: "" }));
                    hasStatusTextRef.current = false;
                    // 立即 dispatch 第一个 token，不进 buffer
                    dispatch(appendStreamToken({ msgId: messageId, token: token }));
                    return;
                }
                tokenBufRef.current += token;
                if (timerRef.current === null) {
                    timerRef.current = setTimeout(() => {
                        timerRef.current = null;
                        if (tokenBufRef.current && streamCtxRef.current) {
                            dispatch(appendStreamToken({
                                msgId: streamCtxRef.current.msgId,
                                token: tokenBufRef.current,
                            }));
                            tokenBufRef.current = "";
                        }
                    }, FLUSH_INTERVAL);
                }
            },
            onComplete: (message: Message) => {
                flushTokenBuffer();
                dispatch(completeStream({ msgId: message.id, content: message.content ?? "" }));
                setIsStreaming(false);
            },
            onError: (messageId: string | null, _UserMsgId: string | null, error: Error) => {
                flushTokenBuffer();

                if (streamCtxRef.current) {
                    // error3: 首 token 已到达，messageId 在 onToken 时已拿到
                    dispatch(errorStream({ msgId: messageId!, error: error.message }));
                } else if (confirmUserMsgRef.current && messageId) {
                    // error2: send user 已落库 / retry 验证通过，后端一定返回 message_id
                    const { tempMsgId: uTempId, msgId: uRealId } = confirmUserMsgRef.current;
                    if (uTempId && uRealId) {
                        // send 场景：confirm user message
                        dispatch(confirmUserMessage({ conversationId, tempMsgId: uTempId, msgId: uRealId }));
                    }
                    dispatch(confirmAssistantMessage({ conversationId, tempMsgId: tempAsstId, msgId: messageId! }));
                    dispatch(errorStream({ msgId: messageId!, error: error.message }));
                } else {
                    // error1: user 未落库 / retry 早期失败（retry_ack 之前），后端无 error assistant
                    dispatch(removeAssistantPlaceholder({ msgId: tempAsstId }));
                    if (tempMsgId) {
                        dispatch(errorUserMessage({ tempMsgId, error: error.message }));
                    }
                    toast.error(error.message);
                }

                setIsStreaming(false);
            },
            onStatusChange: (text: string) => {
                // waiting 阶段用 tempAsstId，streaming 阶段（tool_call）用真实 msgId
                const targetId = streamCtxRef.current?.msgId ?? tempAsstId;
                dispatch(updateWaitingStatus({ msgId: targetId, statusText: text }));
                hasStatusTextRef.current = true;
            },
            onTitle: (title: string) => {
                dispatch(updateConversationTitle({ conversationId, title }));
            },
            onAbort: (messageId: string | null) => {
                flushTokenBuffer();

                if (streamCtxRef.current) {
                    // abort3: 首 token 已到达，confirmAssistantMessage 已在 onToken 中完成
                    dispatch(abortStream({ msgId: messageId! }));
                } else if (confirmUserMsgRef.current) {
                    // abort2: send user 已落库 / retry 已过验证 → 预传的 assistantMsgId 可用
                    const { tempMsgId: uTempId, msgId: uRealId, assistantMsgId: asstId } = confirmUserMsgRef.current;
                    if (uTempId && uRealId) {
                        // send 场景：confirm user message
                        dispatch(confirmUserMessage({ conversationId, tempMsgId: uTempId, msgId: uRealId }));
                    }
                    dispatch(confirmAssistantMessage({ conversationId, tempMsgId: tempAsstId, msgId: asstId }));
                    dispatch(abortStream({ msgId: asstId }));
                } else {
                    // abort1: send user 未落库 / retry 早期失败（retry_ack 之前）
                    dispatch(removeAssistantPlaceholder({ msgId: tempAsstId }));
                    if (tempMsgId) {
                        dispatch(errorUserMessage({ tempMsgId, error: "" }));
                    }
                }

                setIsStreaming(false);
            },
        });
    },[dispatch, conversationId, flushTokenBuffer, store])

    return { send, stop, isStreaming, sendSignalRef };
}