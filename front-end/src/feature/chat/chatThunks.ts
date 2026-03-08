import type { AppDispatch, RootState } from "../../store";
import { switchBranch } from "./chatSlice";
import { updateCurrentLeaf } from "../../service/chat";

export const switchBranchAndNotify =
    (params: { msgId: string; index: number }) =>
    (dispatch: AppDispatch, getState: () => RootState) => {
        dispatch(switchBranch(params));
        const state = getState();
        const message = state.chat.messages[params.msgId];
        if (!message) return;
        const conversation = state.chat.conversations[message.conversationId];
        if (!conversation?.currentLeafId) return;
        // fire-and-forget: 异步通知后端更新 leaf 节点
        updateCurrentLeaf(message.conversationId, conversation.currentLeafId);
    };
