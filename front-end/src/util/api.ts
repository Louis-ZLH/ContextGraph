// 获取环境变量中的 API 基地址
// 如果没有配置，默认使用空字符串（即当前域名）
export const BASE_URL = import.meta.env.API_BASE_URL || "";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * 封装后的 fetch 请求
 * 自动拼接 BASE_URL
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // 确保 endpoint 以 / 开头
  const url = `${BASE_URL}${endpoint.startsWith("/") ? endpoint : "/" + endpoint}`;

  const defaultHeaders: Record<string, string> = {
    // 这里可以统一添加 Token
    // "Authorization": `Bearer ${localStorage.getItem('token')}`
  };

  // FormData 需要浏览器自动设置 Content-Type（带 boundary），不能手动指定
  if (!(options.body instanceof FormData)) {
    defaultHeaders["Content-Type"] = "application/json";
  }

  const config = {
    ...options,
    credentials: "include" as RequestCredentials,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiError(errorBody.message || `HTTP error! status: ${response.status}`, response.status);
  }

  return response.json();
}