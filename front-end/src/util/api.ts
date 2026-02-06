// 获取环境变量中的 API 基地址
// 如果没有配置，默认使用空字符串（即当前域名）
const BASE_URL = import.meta.env.API_BASE_URL || "";

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

  const defaultHeaders = {
    "Content-Type": "application/json",
    // 这里可以统一添加 Token
    // "Authorization": `Bearer ${localStorage.getItem('token')}`
  };

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
    throw new Error(errorBody.message || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}