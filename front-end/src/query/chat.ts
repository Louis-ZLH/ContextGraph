import { queryOptions } from "@tanstack/react-query";
import { getConversationHistory } from "../service/chat";

export const chatHistoryQueryOptions = (conversationId: string, enabled: boolean) => queryOptions({
    queryKey: ["chat", "history", conversationId],
    queryFn: () => {
        // 这里可能访问不存在的会话，后端需要返回true+null
        return getConversationHistory(conversationId)
    },
    retry: 2,
    retryDelay: 500,
    enabled: enabled,
    gcTime: 0, // redux缓存了会话和消息，react-query只用于第一次请求，之后不再请求
});