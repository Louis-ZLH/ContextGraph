function ChatNodeLoading() {
  return (
    <div className="flex-1 flex flex-col gap-3 p-4 source-skeleton-wrapper">
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 rounded-full source-skeleton shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <div className="h-4 rounded source-skeleton w-3/4" />
          <div className="h-4 rounded source-skeleton w-1/2" />
        </div>
      </div>
      <div className="flex items-start gap-2 justify-end">
        <div className="flex flex-col gap-2 items-end flex-1">
          <div className="h-4 rounded source-skeleton w-2/3" />
        </div>
        <div className="w-7 h-7 rounded-full source-skeleton shrink-0" />
      </div>
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 rounded-full source-skeleton shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <div className="h-4 rounded source-skeleton w-5/6" />
          <div className="h-4 rounded source-skeleton w-2/5" />
          <div className="h-4 rounded source-skeleton w-3/5" />
        </div>
      </div>
    </div>
  );
}

export default ChatNodeLoading;
