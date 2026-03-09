import { queryOptions } from "@tanstack/react-query";
import { getFileList, getStorageUsage } from "../service/file";

export function fileListQueryOptions(params: { page: number; limit: number; keyword: string }) {
  return queryOptions({
    queryKey: ["file", "list", params],
    queryFn: () => getFileList(params),
    staleTime: 1000 * 60 * 2,
    retry: false,
  });
}

export const storageUsageQueryOptions = queryOptions({
  queryKey: ["file", "storage"],
  queryFn: () => getStorageUsage(),
  staleTime: 1000 * 60 * 5,
  retry: false,
});
