import { useMemo } from "react";
import { useLocation } from "react-router";
import { useAppSelector } from "../../../hooks";

export function Breadcrumb() {
  const canvasTitle = useAppSelector((s) => s.canvas.title);
  const location = useLocation();
  const pathname = location.pathname;

  const title = useMemo(() => {
    switch (pathname) {
      case "/canvas":
        return "Create Canvas";
      case "/canvas/search":
        return "Search Canvases";
      case "/canvas/myresource":
        return "My Resources";
      default:
        return canvasTitle;
    }
  }, [pathname, canvasTitle]);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 text-secondary text-xs">
        <span>Workspace</span>
        <span className="text-[10px]">&gt;</span>
      </div>
      <h1
        className="font-semibold leading-tight text-sm"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </h1>
    </div>
  );
}
