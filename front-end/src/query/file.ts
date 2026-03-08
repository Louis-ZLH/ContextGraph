import { queryOptions } from "@tanstack/react-query";
import { getFileList } from "../service/file";

export function fileListQueryOptions(params: { page: number; limit: number; keyword: string }) {
  return queryOptions({
    queryKey: ["file", "list", params],
    queryFn: () => getFileList(params),
    staleTime: 1000 * 60 * 2,
    retry: false,
  });
}
