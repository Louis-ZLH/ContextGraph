import { queryOptions } from "@tanstack/react-query";
import { getUserProfile } from "../service/auth";

export const userProfileQueryOptions = queryOptions({
  queryKey: ["user", "profile"],
  queryFn: getUserProfile,
  staleTime: 1000 * 60 * 5, // 5分钟内认为数据是新鲜的，中间件不会重复请求
  retry: false, // 鉴权失败不要重试，直接跳登录
});
