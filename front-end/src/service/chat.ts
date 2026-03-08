import { apiRequest } from "../util/api";
import { toCamelCase } from "../util/transform";
import type { JSONResponse, DTONodeReadyToSend } from "./type";
import type { Message, Conversation } from "../feature/chat/types";
import { BASE_URL } from "../util/api";

export async function getConversationHistory(conversationId: string): Promise<{ success: boolean, message: string, data: Message[] | null }> {
    try{
        const response = await apiRequest<JSONResponse>(`/api/chat/history/${conversationId}`, {
            method: "GET",
        });
        if(response.code !== 0) {
            return { success: false, message: response.message, data: null };
        }
        return { success: true, message: response.message, data: toCamelCase(response.data) as Message[] | null };
    } catch (error: unknown) {
        if (error instanceof Error) {
            return { success: false, message: error.message || "Failed to get conversation history", data: null };
        }
        return { success: false, message: "Failed to get conversation history", data: null };
    }
}

export interface StreamCallbacks {
    onUserMessage: (message: Message, assistantMsgId: string) => void;  // 首条数据：已保存的 user message + 预生成的 assistant ID
    onRetryAck?: (assistantMsgId: string) => void;  // retry 验证通过，携带预生成的 assistant ID
    onToken: (token: string, UserMsgId: string, messageId: string) => void;
    onComplete: (message: Message) => void;
    onError: (messageId: string | null, UserMsgId: string | null, error: Error) => void;
    onAbort: (messageId: string | null) => void;
    onStatusChange?: (text: string) => void;
    onTitle?: (title: string) => void;
}

interface SSEEventHandler {
    onEvent: (event: { type: string; data: Record<string, unknown> }) => void;
    onCatch: (err: unknown) => void;
}

async function streamSSE(
    url: string,
    body: Record<string, unknown>,
    signal: AbortSignal,
    handler: SSEEventHandler,
) {
    const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error("Failed to get reader");
    }
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop()!;

        for (const part of parts) {
            for (const line of part.split("\n")) {
                if (!line.startsWith("data: ")) continue;
                const json = line.slice(6);
                if (json === "[DONE]") return;
                handler.onEvent(JSON.parse(json));
            }
        }
    }
}

export function sendMessageStream(
    conversationId: string,
    content: string | null,
    model: number,
    parentId: string | null,
    isRetry: boolean,
    userMsgId: string | null,
    newParentNodes: DTONodeReadyToSend[],
    deletedParentNodeIds: string[],
    generateTitle: boolean,
    callbacks: StreamCallbacks,
): AbortController {
    const controller = new AbortController();
    let messageId: string | null = null;

    const url = isRetry
        ? `${BASE_URL}/api/chat/retry/message`
        : `${BASE_URL}/api/chat/messages`;

    const parentDelta: Record<string, unknown> = {};
    if (newParentNodes.length > 0) parentDelta.new_parent_nodes = newParentNodes;
    if (deletedParentNodeIds.length > 0) parentDelta.deleted_parent_node_ids = deletedParentNodeIds;

    const body = isRetry
        ? { conversation_id: conversationId, user_msg_id: userMsgId, model, ...parentDelta }
        : { conversation_id: conversationId, content, model, parent_id: parentId, ...(generateTitle && { generate_title: true }), ...parentDelta };

    (async () => {
        try {
            await streamSSE(url, body, controller.signal, {
                onEvent(event) {
                    switch (event.type) {
                        case "user_message":
                            if (!isRetry) {
                                const assistantMsgId = event.data.assistant_msg_id as string;
                                callbacks.onUserMessage(toCamelCase(event.data) as Message, assistantMsgId);
                                userMsgId = event.data.id as string;
                            }
                            break;
                        case "retry_ack":
                            if (event.data) {
                                callbacks.onRetryAck?.(event.data.assistant_msg_id as string);
                            }
                            break;
                        case "token":
                            callbacks.onToken(event.data.content as string, userMsgId as string, event.data.message_id as string);
                            messageId = event.data.message_id as string;
                            break;
                        case "complete":
                            callbacks.onComplete(toCamelCase(event.data) as Message);
                            messageId = null;
                            break;
                        case "summarizing":
                            callbacks.onStatusChange?.(event.data.reason as string);
                            break;
                        case "thinking":
                            callbacks.onStatusChange?.("Thinking...");
                            break;
                        case "tool_call":
                            callbacks.onStatusChange?.(event.data.content as string);
                            break;
                        case "title":
                            callbacks.onTitle?.(event.data.title as string);
                            break;
                        case "error":
                            // user 落库后，后端始终写入 error assistant 并通过 message_id 传回
                            if (event.data.message_id) messageId = event.data.message_id as string;
                            callbacks.onError(messageId, userMsgId, new Error(event.data.message as string));
                            messageId = null;
                            break;
                    }
                },
                onCatch() { /* handled below */ },
            });
        } catch (err) {
            if ((err as Error).name !== "AbortError") {
                callbacks.onError(messageId, userMsgId, err as Error);
            } else {
                callbacks.onAbort(messageId);
            }
        }
    })();

    return controller;
}

export async function updateCurrentLeaf(conversationId: string, leafId: string): Promise<void> {
    try {
        await apiRequest<JSONResponse>(`/api/chat/conversations/${conversationId}/leaf`, {
            method: "PUT",
            body: JSON.stringify({ leaf_id: leafId }),
        });
    } catch (error) {
        console.error("Failed to update current leaf:", error);
    }
}

export async function createConversation(conversationId: string, content: string, canvasId: string): Promise<{ success: boolean, message: string, data: { conversation: Conversation, rootMessage: Message} | null }> {
    try{
        const response = await apiRequest<JSONResponse>(`/api/chat/create`, {
            method: "POST",
            body: JSON.stringify({ conversation_id: conversationId, content, canvas_id: canvasId }),
        });
        if(response.code !== 0) {
            return { success: false, message: response.message, data: null };
        }
        return { success: true, message: response.message, data: toCamelCase(response.data) as { conversation: Conversation, rootMessage: Message} };
    } catch (error: unknown) {
        if (error instanceof Error) {
            return { success: false, message: error.message || "Failed to create conversation", data: null };
        }
        return { success: false, message: "Failed to create conversation", data: null };
    }
}