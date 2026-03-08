import { useEffect } from "react";
import { Outlet } from "react-router";
import { useSelector } from "react-redux";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useQuery } from "@tanstack/react-query";
import { userProfileQueryOptions } from "../../query/user";
import type { User } from "../../service/type";
import type { ThemeName } from "../../feature/user/userSlice";

export default function CanvasLayout() {
  const { data } = useQuery(userProfileQueryOptions);
  const theme = useSelector(
    (state: { user: { theme: ThemeName } }) => state.user.theme,
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <div className="flex h-screen overflow-hidden bg-app">
      <Sidebar user={data?.data as User | null} />
      {/* Main */}
      <div className="flex-1 flex flex-col relative min-w-0">
        <Header />
        {/* Canvas */}
        <Outlet />
      </div>
    </div>
  );
}