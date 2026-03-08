import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ChatState, Conversation, Message } from "./types";
import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "../../store";
import { shallowEqual } from "react-redux";

const initialState: ChatState = {
    conversations: {},
    messages: {},
}

const chatSlice = createSlice({
    name: "chat",
    initialState,
    reducers: {
        // // 切换canvas时清空所有会话和消息
        // emptyState: (state) => {
        //     state.conversations = {};
        //     state.messages = {};
        // },
        // 考虑用户在canvas内频繁操作，下面只增加，不删除，除非切换canvas。
        // 载入会话
        loadConversations: (state, action: PayloadAction<Conversation[]>) => {
            const conversations = action.payload;
            if (conversations.length === 0) return; // no conversations to load
            conversations.forEach((conversation) => {
                // state.conversations[conversation.id] = conversation;
                if (!state.conversations[conversation.id]) {
                    state.conversations[conversation.id] = conversation;
                } else {
                    Object.assign(state.conversations[conversation.id], conversation);
                }
            });
        },
        setConversationHasFetchedMessages: (state, action: PayloadAction<{ conversationId: string }>) => {
            const { conversationId } = action.payload;
            const conversation = state.conversations[conversationId];
            if (!conversation){
                state.conversations[conversationId] = {
                    id: conversationId,
                    title: null,
                    updatedAt: Date.now(),
                    rootMessageId: null,
                    currentLeafId: null,
                    hasFetchedMessages: true,
                };
            } else {
                conversation.hasFetchedMessages = true;
            }
        },
        // 载入消息（后端不返回 childrenIds，前端从 parentId 构建）
        loadMessages: (state, action: PayloadAction<Message[]>) => {
            const messages = action.payload;
            // 先存入所有消息，初始化 childrenIds 为空数组
            messages.forEach((message) => {
                state.messages[message.id] = { ...message, childrenIds: [] };
            });
            // 再遍历一次，根据 parentId 构建 childrenIds
            messages.forEach((message) => {
                if (message.parentId && state.messages[message.parentId]) {
                    state.messages[message.parentId].childrenIds.push(message.id);
                }
            });
        },
        // 乐观写入
        addUserMessage: (state, action: PayloadAction<{ conversationId: string, msgId: string, parentId: string | null, content: string, model: number}>) => {
            const { conversationId, msgId, parentId, content, model } = action.payload;
            const conversation = state.conversations[conversationId];
            if (!conversation) return;
            let parentIdToUse = parentId;
            if (!parentIdToUse) parentIdToUse = conversation.currentLeafId as string;
            const LastMessage = state.messages[parentIdToUse];
            if (!LastMessage) return;
            LastMessage.childrenIds.push(msgId); // 更新子节点列表
            const message: Message = {
                id: msgId,
                conversationId,
                parentId: parentIdToUse,
                childrenIds: [],
                content,
                role: "user",
                status: "sending",
                model: model,
                createdAt: Date.now(),
                metadata: {},
            }
            state.messages[msgId] = message;
            conversation.currentLeafId = msgId;
        },
        // 乐观写入 assistant 占位消息（waiting 状态，空内容）
        addAssistantPlaceholder: (state, action: PayloadAction<{ conversationId: string, msgId: string, parentId: string, model: number }>) => {
            const { conversationId, msgId, parentId, model } = action.payload;
            const conversation = state.conversations[conversationId];
            if (!conversation) return;
            const parentMessage = state.messages[parentId];
            if (!parentMessage) return;
            parentMessage.childrenIds.push(msgId);
            state.messages[msgId] = {
                id: msgId,
                conversationId,
                parentId,
                childrenIds: [],
                content: "",
                role: "assistant",
                status: "waiting",
                model,
                createdAt: Date.now(),
                metadata: {},
            };
            conversation.currentLeafId = msgId;
        },
        confirmUserMessage: (state, action: PayloadAction<{ conversationId: string, tempMsgId: string, msgId: string}>) => {
            const { conversationId, tempMsgId, msgId } = action.payload;
            const conversation = state.conversations[conversationId];
            if (!conversation) return;
            const tempMessage = state.messages[tempMsgId];
            if (!tempMessage) return;
            const parentMessage = state.messages[tempMessage.parentId as string];
            if (!parentMessage) return;
            const index = parentMessage.childrenIds.indexOf(tempMsgId);
            if (index === -1) return;
            parentMessage.childrenIds[index] = msgId;
            tempMessage.status = "completed";
            tempMessage.id = msgId;
            state.messages[msgId] = tempMessage;
            delete state.messages[tempMsgId];
            // 更新 placeholder 子消息的 parentId
            const child = state.messages[tempMessage.childrenIds[0]];
            if (child) child.parentId = msgId;
            // 仅在当前叶子是本条消息时才更新（有 placeholder 时叶子已经是 placeholder）
            if (conversation.currentLeafId === tempMsgId) {
                conversation.currentLeafId = msgId;
            }
        },
        // 首个 token 到达时，将 placeholder 的 tempId 替换为后端真实 id，状态 waiting → streaming
        confirmAssistantMessage: (state, action: PayloadAction<{ conversationId: string, tempMsgId: string, msgId: string }>) => {
            const { conversationId, tempMsgId, msgId } = action.payload;
            const conversation = state.conversations[conversationId];
            if (!conversation) return;
            const tempMessage = state.messages[tempMsgId];
            if (!tempMessage || tempMessage.status !== "waiting") return;
            const parentMessage = state.messages[tempMessage.parentId as string];
            if (!parentMessage) return;
            const index = parentMessage.childrenIds.indexOf(tempMsgId);
            if (index === -1) return;
            parentMessage.childrenIds[index] = msgId;
            tempMessage.id = msgId;
            tempMessage.status = "streaming";
            state.messages[msgId] = tempMessage;
            delete state.messages[tempMsgId];
            if (conversation.currentLeafId === tempMsgId) {
                conversation.currentLeafId = msgId;
            }
        },
        // 错误/取消时移除未确认的 placeholder
        removeAssistantPlaceholder: (state, action: PayloadAction<{ msgId: string }>) => {
            const { msgId } = action.payload;
            const message = state.messages[msgId];
            if (!message || message.role !== "assistant" || message.status !== "waiting") return;
            const parentMessage = state.messages[message.parentId as string];
            if (parentMessage) {
                parentMessage.childrenIds = parentMessage.childrenIds.filter(id => id !== msgId);
            }
            const conversation = state.conversations[message.conversationId];
            if (conversation && conversation.currentLeafId === msgId) {
                conversation.currentLeafId = message.parentId as string;
            }
            delete state.messages[msgId];
        },
        errorUserMessage: (state, action: PayloadAction<{ tempMsgId: string, error: string}>) => {
            const { tempMsgId, error } = action.payload;
            const tempMessage = state.messages[tempMsgId];
            if (!tempMessage) return;
            // 将本条消息标记为错误
            tempMessage.status = "error";
            tempMessage.error = error;

            // 将消息当作幽灵消息，显示在本次UI上，但是不参与逻辑。
            const conversation = state.conversations[tempMessage.conversationId];
            if (!conversation) return;
            conversation.currentLeafId = tempMessage.parentId as string;
            const parentMessage = state.messages[tempMessage.parentId as string];
            if (!parentMessage) return;
            parentMessage.childrenIds = parentMessage.childrenIds.filter((id) => id !== tempMsgId);
        },
        errorMessage: (state, action: PayloadAction<{ msgId: string, error: string}>) => {
            const { msgId, error } = action.payload;
            const message = state.messages[msgId];
            if (!message) return;
            message.status = "error";
            message.error = error;
        },
        appendStreamToken: (state, action: PayloadAction<{ msgId: string, token: string }>) => {
            const { msgId, token } = action.payload;
            const message = state.messages[msgId];
            if (!message || message.status !== "streaming") return;
            message.content = (message.content ?? "") + token;
        },
        completeStream: (state, action: PayloadAction<{ msgId: string; content: string }>) => {
            const { msgId, content } = action.payload;
            const message = state.messages[msgId];
            if (!message || message.role !== "assistant" || message.status !== "streaming") return;
            message.content = content;
            message.status = "completed";
        },
        errorStream: (state, action: PayloadAction<{ msgId: string, error: string}>) => {
            const { msgId, error } = action.payload;
            const message = state.messages[msgId];
            if (!message || message.role !== "assistant" || message.status !== "streaming") return;
            message.status = "error";
            message.error = error;
        },
        abortStream: (state, action: PayloadAction<{ msgId: string}>) => {
            const { msgId } = action.payload;
            const message = state.messages[msgId];
            if (!message || message.role !== "assistant" || message.status !== "streaming") return;
            message.status = "aborted";
        },
        updateWaitingStatus: (state, action: PayloadAction<{ msgId: string, statusText: string }>) => {
            const { msgId, statusText } = action.payload;
            const message = state.messages[msgId];
            if (!message || (message.status !== "waiting" && message.status !== "streaming")) return;
            message.statusText = statusText || undefined;
        },
        updateConversationTitle: (state, action: PayloadAction<{ conversationId: string, title: string }>) => {
            const { conversationId, title } = action.payload;
            const conversation = state.conversations[conversationId];
            if (!conversation) return;
            conversation.title = title;
        },
        switchBranch: (state, action: PayloadAction<{ msgId: string, index: number}>) => {
            const { msgId, index } = action.payload;
            const message = state.messages[msgId];
            if (!message) return;
            const conversation = state.conversations[message.conversationId];
            if (!conversation) return;
            const parentMessage = state.messages[message.parentId as string];
            if (!parentMessage) return;
            const siblingMessageId = parentMessage.childrenIds[index];
            const siblingMessage = state.messages[siblingMessageId];
            if (!siblingMessage) return;

            let currentMessage = siblingMessage;
            while(currentMessage.childrenIds.length > 0) {
                currentMessage = state.messages[currentMessage.childrenIds[currentMessage.childrenIds.length - 1]];
                if (!currentMessage) break;
            }
            if (!currentMessage) return;
            conversation.currentLeafId = currentMessage.id;
        }
    },
}); 

/**
 * 获取所有消息
 * @param state 
 * @returns 
 */
export const selectMessages = (state: RootState) => state.chat.messages;

/**
 * 获取所有会话
 * @param state 
 * @returns 
 */
export const selectConversations = (state: RootState) => state.chat.conversations;

// 判断会话是否已经创建
// 如果会话的rootMessageId不为null，则认为会话已经创建
export const selectConversationHasCreated = (state: RootState, conversationId: string)=> {
    const rootMessageId = state.chat.conversations[conversationId]?.rootMessageId;
    if (!rootMessageId) return false; // rootMessageId为null或者conversation不存在
    return true;
}

/**
 * 获取指定会话的当前视图叶子节点id
 * @param state 
 * @param conversationId 
 * @returns 
 */
export const selectCurrentLeafIdByConversationId = 
(state: RootState, conversationId: string) => {
    const conversation = state.chat.conversations[conversationId];
    if (!conversation) return null;
    return conversation.currentLeafId;
}

/**
 * 获取指定会话的当前线程消息id列表
 * @example
 * 使用工厂模式，每个组件用独立的selector，避免缓存抖动。
 * const selectCurrentThreadIdsByConversationId = useMemo(makeSelectCurrentThreadIdsByConversationId, []);
 * const threadIds = useSelector((state) => selectCurrentThreadIdsByConversationId(state, "conversationId"), shallowEqual);
 * @returns 
 */
export const makeSelectCurrentThreadIdsByConversationId = () => {
    let lastLeafId: string | null | undefined;
    let lastResult: string[] = [];

    return (state: RootState, conversationId: string) => {
        const leafId = selectCurrentLeafIdByConversationId(state, conversationId);
        // leafId 没变且上次有结果（或 leafId 本身就是 null）→ 使用缓存
        // leafId 没变但上次结果为空且 leafId 非空 → 说明消息还没加载，不走缓存
        if (leafId === lastLeafId && (lastResult.length > 0 || !leafId)) return lastResult;

        const messages = state.chat.messages;
        const threadIds: string[] = [];
        let currentId = leafId;
        while (currentId && messages[currentId] && messages[currentId].role !== "root") {
            threadIds.push(currentId);
            currentId = messages[currentId]?.parentId as string;
        }
        threadIds.reverse();

        lastLeafId = leafId;
        lastResult = threadIds;
        return lastResult;
    };
};


/**
 * 获取指定消息
 * @param state 
 * @param messageId 
 * @returns 
 */
export const selectMessageById = 
(state: RootState, messageId: string) => 
state.chat.messages[messageId as string];

/**
 * 获取指定会话信息
 * @param state 
 * @param conversationId 
 * @returns 
 */
export const selectConversationById = 
(state: RootState, conversationId: string) => 
state.chat.conversations[conversationId as string];

export const selectParentMessageById = 
(state: RootState, messageId: string) => {
    const message = state.chat.messages[messageId as string];
    if (!message || !message.parentId) return null;
    return state.chat.messages[message.parentId as string];
}

/**
 * 获取指定消息的兄弟信息
 * @param state 
 * @param messageId 
 * @returns 
 * @example
 * const siblingInfo = useSelector((state) => selectSiblingInfo(state, "messageId"), shallowEqual);
 */

export const makeSelectSiblingInfo = () =>
createSelector(
    [selectParentMessageById, selectMessageById],
    (parentMessage, currentMessage) => {
        if (!currentMessage || !currentMessage.parentId) return null; // 根节点没有兄弟
        if (!parentMessage) return null;
        const siblings = parentMessage.childrenIds;
        return {
            hasBranches: siblings.length > 1,
            current: siblings.indexOf(currentMessage.id) + 1,
            total: siblings.length
        };
    },
    {
        memoizeOptions: {
            resultEqualityCheck: shallowEqual
        }
    }
);

export default chatSlice.reducer;

export const {
    //emptyState,
    loadConversations,
    setConversationHasFetchedMessages,
    loadMessages,
    addUserMessage,
    addAssistantPlaceholder,
    confirmUserMessage,
    confirmAssistantMessage,
    removeAssistantPlaceholder,
    appendStreamToken,
    errorMessage,
    completeStream,
    errorStream,
    abortStream,
    switchBranch,
    errorUserMessage,
    updateWaitingStatus,
    updateConversationTitle,
} = chatSlice.actions;