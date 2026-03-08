import { useQuery } from "@tanstack/react-query";
import { chatHistoryQueryOptions } from "../../query/chat";
import type { Message } from "./types";
import { loadMessages } from "./chatSlice";
import { useDispatch } from "react-redux";
import { useSelector } from "react-redux";
import { useEffect } from "react";
import type { RootState } from "../../store";
import { selectConversationHasCreated, setConversationHasFetchedMessages } from "./chatSlice";

export function useConversationLoader(conversationId: string) {
    const dispatch = useDispatch();
    const conversationHasFetchedMessages = useSelector((state: RootState) => state.chat.conversations[conversationId]?.hasFetchedMessages);
    const conversationHasCreated = useSelector((state: RootState) => selectConversationHasCreated(state, conversationId));
    const { data, isLoading } = useQuery(chatHistoryQueryOptions(conversationId, !conversationHasFetchedMessages));
    const { success,message, data: messages } = data || { success: false, message: "", data: null };

    useEffect(() => {
        if(messages) dispatch(loadMessages(messages as Message[]));
    }, [dispatch, messages]);

    useEffect(() => {
        if(success) dispatch(setConversationHasFetchedMessages({ conversationId }));
    }, [dispatch, success, conversationId]);

    // 只有拉取历史对话时才显示loading
    return { isLoading: conversationHasCreated && isLoading, error: success ? null : message };
}