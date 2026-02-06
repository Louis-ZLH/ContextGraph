export function isValidEmail(email: string) {
    if (!email || typeof email !== 'string') return false;
  
    // 1. 长度校验（根据 RFC 5321，邮箱最大长度为 254 个字符）
    if (email.length > 254) return false;
  
    // 2. 正则校验
    // ^ 与 $ 确保匹配整个字符串
    // [a-zA-Z0-9._%+-]+ 匹配账号部分，允许数字、字母、下划线、点、百分号、加减号
    // @ 必须有且仅有一个 @ 符号
    // [a-zA-Z0-9.-]+ 匹配域名部分
    // \.[a-zA-Z]{2,} 确保顶级域名至少有两个字母（如 .com, .cn, .io）
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
    if (!emailRegex.test(email)) return false;
  
    // 3. 进阶逻辑校验（防止出现 .. 这种正则较难处理的情况）
    if (email.includes('..')) return false;
  
    return true;
  }

export function isValidPassword(password: string): { isValid: boolean; message?: string } {
    if (!password) return { isValid: false, message: "Password cannot be empty" };
    
    // 长度至少8位
    if (password.length < 8) return { isValid: false, message: "Password must be at least 8 characters long" };
    
    // 长度不能超过32位
    if (password.length > 32) return { isValid: false, message: "Password must be less than 32 characters long" };

    // 包含大写字母
    if (!/[A-Z]/.test(password)) return { isValid: false, message: "Password must contain at least one uppercase letter" };
    
    // 包含小写字母
    if (!/[a-z]/.test(password)) return { isValid: false, message: "Password must contain at least one lowercase letter" };
    
    // 包含数字
    if (!/\d/.test(password)) return { isValid: false, message: "Password must contain at least one number" };
    
    // 包含特殊字符 (非字母数字)
    if (!/[^a-zA-Z0-9]/.test(password)) return { isValid: false, message: "Password must contain at least one special character" };

    return { isValid: true };
}
