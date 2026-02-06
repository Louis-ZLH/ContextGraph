
export type User = {
    userId: string;
    username: string;
    email: string;
    plan: "free" | "plus" | "pro";
    avatarUrl: string;
    tokenQuota: string;
}
