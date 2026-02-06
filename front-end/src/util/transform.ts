
/**
 * 将字符串从 snake_case 转换为 camelCase
 */
function snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

/**
 * 递归将对象的所有 key 从 snake_case 转换为 camelCase
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toCamelCase(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map((v) => toCamelCase(v));
    } else if (obj !== null && typeof obj === 'object') {
        return Object.keys(obj).reduce(
            (result, key) => {
                const camelKey = snakeToCamel(key);
                result[camelKey] = toCamelCase(obj[key]);
                return result;
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {} as any
        );
    }
    return obj;
}
