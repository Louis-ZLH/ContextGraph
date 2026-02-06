import { useEffect } from "react";
import { Outlet } from "react-router";
import { useSelector, useDispatch } from "react-redux";
import { changeTheme } from "../../feature/user/userSlice";
import { Sidebar } from "./Sidebar";
import { Header, type ThemeName } from "./Header";
import { useQuery } from "@tanstack/react-query";
import { userProfileQueryOptions } from "../../query/user";
import type { User } from "../../service/type";

export default function CanvasLayout() {
  const { data } = useQuery(userProfileQueryOptions);
  const dispatch = useDispatch();
  const theme = useSelector(
    (state: { user: { theme: ThemeName } }) => state.user.theme,
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = (t: ThemeName) => {
    dispatch(changeTheme(t));
  };

  return (
    <div className="flex h-screen overflow-hidden bg-app">
      <Sidebar user={data?.data as User | null} />
      {/* Main */}
      <div className="flex-1 flex flex-col relative min-w-0">
        <Header theme={theme} onSetTheme={setTheme} />
        {/* Canvas */}
        <Outlet />
      </div>
    </div>
  );
}