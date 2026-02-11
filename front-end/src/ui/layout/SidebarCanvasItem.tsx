import { Workflow, MoreHorizontal, Pencil, Share2, Trash2 } from "lucide-react";
import { Link } from "react-router";
import type { Canvas } from "../../service/type";
import type { ThemeName } from "../../feature/user/userSlice";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { RenameCanvasModal } from "../canvas/RenameCanvasModal";
import { DeleteCanvasModal } from "../canvas/DeleteCanvasModal";


interface SidebarCanvasItemProps {
  canvas: Canvas;
  theme: ThemeName;
  isActive: boolean;
}

export function SidebarCanvasItem({ canvas, theme, isActive }: SidebarCanvasItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        showMenu &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    // 滚动时关闭菜单
    window.addEventListener("scroll", () => setShowMenu(false), true);
    // 处理 React Flow 等 Canvas 区域的点击
    function handleGlobalClick(event: MouseEvent) {
      if (
        showMenu &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowMenu(false);
      }
    }
    window.addEventListener("click", handleGlobalClick, true);
    
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", () => setShowMenu(false), true);
      window.removeEventListener("click", handleGlobalClick, true);
    };
  }, [showMenu]);

  const handleToggleMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!showMenu && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        left: rect.left
      });
    }
    setShowMenu(!showMenu);
  };

  const handleRenameStart = () => {
    setShowRenameModal(true);
    setShowMenu(false);
  };

  const handleDeleteStart = () => {
    setShowDeleteModal(true);
    setShowMenu(false);
  };

  const menuBg = theme === "cyber" 
    ? "bg-zinc-900 border-zinc-700 text-zinc-200" 
    : "bg-white border-gray-200 text-gray-700";
    
  const menuHover = theme === "cyber"
    ? "hover:bg-zinc-800"
    : "hover:bg-gray-50";

  return (
    <>
      <div
        className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors duration-200 group relative ${
          isActive
            ? "bg-accent/15 text-accent"
            : `text-primary ${theme === "cyber" ? "hover:bg-white/10" : "hover:bg-black/5"}`
        }`}
      >
        <Link
          to={`/canvas/${canvas.id}`}
          className="absolute inset-0 z-0"
          aria-label={canvas.title}
        />
        <div className="relative z-10 flex items-center gap-3 min-w-0 flex-1 pointer-events-none">
          <Workflow
            size={16}
            className={
              isActive
                ? "text-accent"
                : "text-secondary group-hover:text-accent"
            }
          />
          <span className="text-sm truncate">{canvas.title}</span>
        </div>

        <div className="relative z-10 shrink-0 pointer-events-auto">
          <button
            ref={buttonRef}
            onClick={handleToggleMenu}
            className={`cursor-pointer p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
              showMenu ? "opacity-100 bg-black/10 dark:bg-white/10" : "hover:bg-black/10 dark:hover:bg-white/10"
            }`}
          >
            <MoreHorizontal size={16} />
          </button>

          {showMenu && createPortal(
            <div 
              ref={menuRef}
              style={{ 
                top: menuPos.top, 
                left: menuPos.left,
                position: 'fixed'
              }}
              className={`w-36 rounded-lg shadow-xl border p-1 z-50 ${menuBg}`}
            >
              <button onClick={handleRenameStart} className={`cursor-pointer w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${menuHover}`}>
                <Pencil size={12} />
                <span>Rename</span>
              </button>
              <button className={`cursor-pointer w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${menuHover}`}>
                <Share2 size={12} />
                <span>Share</span>
              </button>
              <button onClick={handleDeleteStart} className={`cursor-pointer w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20`}>
                <Trash2 size={12} />
                <span>Delete</span>
              </button>
            </div>,
            document.body
          )}
        </div>
      </div>
      <RenameCanvasModal
        isOpen={showRenameModal}
        onClose={() => setShowRenameModal(false)}
        canvasId={canvas.id}
        currentTitle={canvas.title}
      />
      <DeleteCanvasModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        canvasId={canvas.id}
        canvasTitle={canvas.title}
      />
    </>
  );
}
