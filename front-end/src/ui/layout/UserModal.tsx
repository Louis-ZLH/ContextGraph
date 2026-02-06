import { X, User as UserIcon, LogOut, CreditCard, Bell, Shield, Palette } from "lucide-react";
import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSelector } from "react-redux";
import type { ThemeName } from "../../feature/user/userSlice";
import type { User } from "../../service/type";
import { logoutUser } from "../../service/auth";
import { useNavigate } from "react-router";
import { toast } from "react-hot-toast";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "../../query";

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

export function UserModal({ isOpen, onClose, user }: UserModalProps) {
  const theme = useSelector(
    (state: { user: { theme: ThemeName } }) => state.user.theme
  );
  const navigate = useNavigate();
  // ESC 键关闭
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  const mutation = useMutation({
    mutationFn: logoutUser,
    onSuccess: (data: { success: boolean, message: string }) => {
      if (data.success) {
        navigate("/");
        queryClient.clear();
      } else{
        toast.error(data.message);
      }
    },
    onError: (error: Error) => {
      toast.error("Failed to logout: " + error.message);
    },
  });

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const menuItems = [
    { icon: UserIcon, label: "Profile", description: "Manage your account" },
    { icon: CreditCard, label: "Subscription", description: "Billing & plans" },
    { icon: Bell, label: "Notifications", description: "Alert preferences" },
    { icon: Palette, label: "Appearance", description: "Theme settings" },
    { icon: Shield, label: "Security", description: "Password & 2FA" },
  ];

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      onClick={onClose}
    >
      {/* 遮罩层 */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          theme === "cyber"
            ? "bg-black/70 backdrop-blur-sm"
            : theme === "paper"
              ? "bg-stone-900/40"
              : "bg-black/50"
        }`}
      />

      {/* Modal 主体 */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-md mx-4 rounded-2xl shadow-2xl transform transition-[transform,opacity] duration-300 animate-in fade-in zoom-in-95 ${
          theme === "cyber"
            ? "bg-slate-900 border border-slate-700"
            : theme === "paper"
              ? "bg-[#fdfbf7] border border-stone-300"
              : "bg-white border border-gray-200"
        }`}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 p-2 rounded-full transition-colors cursor-pointer ${
            theme === "cyber"
              ? "hover:bg-white/10 text-slate-400 hover:text-white"
              : theme === "paper"
                ? "hover:bg-stone-200 text-stone-500 hover:text-stone-800"
                : "hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          }`}
        >
          <X size={20} />
        </button>

        {/* Header 区域 */}
        <div className="p-6 pb-4">
          <div className="flex items-center gap-4">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt="User Avatar"
                className={`w-16 h-16 rounded-full ring-4 ring-offset-2 ${
                  theme === "cyber"
                    ? "ring-emerald-500 ring-offset-slate-900"
                    : theme === "paper"
                      ? "ring-orange-500 ring-offset-[#fdfbf7]"
                      : "ring-blue-500 ring-offset-white"
                }`}
              />
            ) : (
              <div
                className={`w-16 h-16 rounded-full bg-gradient-to-tr from-blue-400 to-purple-500 ring-4 ring-offset-2 ${
                  theme === "cyber"
                    ? "ring-purple-500/50 ring-offset-slate-900"
                    : theme === "paper"
                      ? "ring-purple-400/50 ring-offset-[#fdfbf7]"
                      : "ring-purple-400/50 ring-offset-white"
                }`}
              />
            )}
            <div>
              <h2
                className="text-xl font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                {user?.username || "Guest User"}
              </h2>
              <p className="text-sm text-secondary">{user?.email || "guest@example.com"}</p>
              <span
                className={`inline-block mt-2 px-3 py-1 text-xs font-medium rounded-full ${
                  theme === "cyber"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : theme === "paper"
                      ? "bg-orange-100 text-orange-600"
                      : "bg-blue-100 text-blue-600"
                }`}
              >
                {user?.plan || "Free"} Plan
              </span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-main mx-6" />

        {/* 菜单项 */}
        <div className="p-4 space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.label}
              className={`w-full flex items-center gap-4 p-3 rounded-xl transition-colors cursor-pointer text-left ${
                theme === "cyber"
                  ? "hover:bg-white/5"
                  : theme === "paper"
                    ? "hover:bg-stone-100"
                    : "hover:bg-gray-50"
              }`}
            >
              <div
                className={`p-2 rounded-lg ${
                  theme === "cyber"
                    ? "bg-emerald-500/10"
                    : theme === "paper"
                      ? "bg-orange-100"
                      : "bg-blue-50"
                }`}
              >
                <item.icon
                  size={18}
                  className={
                    theme === "cyber"
                      ? "text-emerald-400"
                      : theme === "paper"
                        ? "text-orange-500"
                        : "text-blue-500"
                  }
                />
              </div>
              <div>
                <p
                  className="font-medium text-sm"
                  style={{ color: "var(--text-primary)" }}
                >
                  {item.label}
                </p>
                <p className="text-xs text-secondary">{item.description}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-main mx-6" />

        {/* 退出按钮 */}
        <div className="p-4">
          <button
            className={`w-full flex items-center justify-center gap-2 p-3 rounded-xl font-medium transition-colors cursor-pointer ${
              theme === "cyber"
                ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                : theme === "paper"
                  ? "bg-red-50 text-red-600 hover:bg-red-100"
                  : "bg-red-50 text-red-500 hover:bg-red-100"
            }`}
            onClick={() => mutation.mutate()}
          >
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );

  // 使用 Portal 挂载到 body
  return createPortal(modalContent, document.body);
}
