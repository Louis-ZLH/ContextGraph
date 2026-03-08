import type { ThemeName } from "../../../../feature/user/userSlice";
import { useSelector, shallowEqual } from "react-redux";
import type { RootState } from "../../../../store";
import { selectMessageById, makeSelectSiblingInfo } from "../../../../feature/chat/chatSlice";
import UserMessage from "./UserMessage";
import AssistantMessage from "./AssistantMessage";
import { useMemo, memo } from "react";

const MessageItem = memo(function MessageItem({ threadId, theme, ref }: { threadId: string; theme: ThemeName; ref?: React.Ref<HTMLDivElement> }) {
  const message = useSelector((state: RootState) => selectMessageById(state, threadId));
  const selectSiblingInfo = useMemo(() => makeSelectSiblingInfo(), []);
  const siblingInfo = useSelector((state: RootState) => selectSiblingInfo(state, threadId), shallowEqual);
  const { hasBranches, current, total } = siblingInfo ?? {};

  if (message?.role === "user") {
    return <UserMessage message={message} hasBranches={hasBranches} current={current} total={total} ref={ref} />;
  }

  if (message?.role === "assistant") {
    return <AssistantMessage message={message} theme={theme} hasBranches={hasBranches} current={current} total={total} ref={ref} />;
  }

  return null;
});

export default MessageItem;
