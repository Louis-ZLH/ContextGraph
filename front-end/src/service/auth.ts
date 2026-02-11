import type { User } from "./type";
import { apiRequest } from "../util/api";
import { toCamelCase } from "../util/transform";
import type { JSONResponse } from "./type";

export async function sendVerificationCode(email: string, type: "register" | "reset_password"): Promise<{ success: boolean, message: string }> {
    try{
        const response = await apiRequest<JSONResponse>("/api/auth/code",  {
            method: "POST",
            body: JSON.stringify({ email, type }),
        });

        if(response.code !== 0) {
            return { success: false, message: response.message };
        }
        return { success: true, message: response.message };
    } catch (error: unknown) {
        if (error instanceof Error) {
            return { success: false, message: error.message || "Failed to send verification code" };
        }
        return { success: false, message: "Failed to send verification code" };
    }
}

export async function verifyVerificationCode(email: string, code: string, type: "register" | "reset_password"): Promise<{ success: boolean, message: string }> {
    try{
        const response = await apiRequest<JSONResponse>("/api/auth/verify", {
            method: "POST",
            body: JSON.stringify({ email, code, type }),
        });

        if(response.code !== 0) {
            return { success: false, message: response.message };
        }
        return { success: true, message: response.message };
    } catch (error: unknown) {
        if (error instanceof Error) {
            return { success: false, message: error.message || "Failed to verify verification code" };
        }
        return { success: false, message: "Failed to verify verification code" };
    }
}

export async function registerUser(username: string, password: string): Promise<{ success: boolean, message: string }> {
    try{
        const response = await apiRequest<JSONResponse>("/api/auth/register", {
            method: "POST",
            body: JSON.stringify({ username, password }),
        });

        if(response.code !== 0) {
            return { success: false, message: response.message };
        }
        return { success: true, message: response.message };
    } catch (error: unknown) {
        if (error instanceof Error) {
            return { success: false, message: error.message || "Failed to register user" };
        }
        return { success: false, message: "Failed to register user" };
    }
}

export async function loginUser(email: string, password: string): Promise<{ success: boolean, message: string }> {
    try{
        const response = await apiRequest<JSONResponse>("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
        });

        if(response.code !== 0) {
            return { success: false, message: response.message };
        }
        return { success: true, message: response.message };
    } catch (error: unknown) {
        if (error instanceof Error) {
            return { success: false, message: error.message || "Failed to login user" };
        }
        return { success: false, message: "Failed to login user" };
    }
}

export async function logoutUser(): Promise<{ success: boolean, message: string }> {
    try{
        const response = await apiRequest<JSONResponse>("/api/auth/logout", {
            method: "POST",
        });
        if(response.code !== 0) {
            return { success: false, message: response.message };
        }
        return { success: true, message: response.message };
    } catch (error: unknown) {
        if (error instanceof Error) {
            return { success: false, message: error.message || "Failed to logout user" };
        }
        return { success: false, message: "Failed to logout user" };
    }
}

export async function getUserProfile(): Promise<{ success: boolean, message: string, data: User | null }> {
    try{
        // with cookie
        const response = await apiRequest<JSONResponse>("/api/user/profile", {
            method: "GET",
        });
        if(response.code !== 0) {
            return { success: false, message: response.message, data: null };
        }
        
        // Use generic utility to convert all keys to camelCase
        const user = toCamelCase(response.data) as User;

        return { success: true, message: response.message, data: user };
    } catch (error: unknown) {
        if (error instanceof Error) {
            return { success: false, message: error.message || "Failed to get user basic info", data: null };
        }
        return { success: false, message: "Failed to get user basic info", data: null };
    }
}

export async function resetPassword(email: string, password: string, code: string): Promise<{ success: boolean, message: string }> {
    try{
        const response = await apiRequest<JSONResponse>("/api/auth/reset-password", {
            method: "POST",
            body: JSON.stringify({ email, password, code }),
        });

        if(response.code !== 0) {
            return { success: false, message: response.message };
        }
        return { success: true, message: response.message };
    } catch (error: unknown) {
        if (error instanceof Error) {
            return { success: false, message: error.message || "Failed to reset password" };
        }
        return { success: false, message: "Failed to reset password" };
    }
}
