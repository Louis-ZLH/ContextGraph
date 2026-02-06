import { createBrowserRouter } from "react-router"; // 注意检查这是 v6 还是 v7 的写法，App.tsx里用的是 react-router
import GlobalLayout from "../ui/layout/GlobalLayout";
import CanvasLayout from "../ui/layout/CanvasLayout";
import LandingPage from "../view";
import LoginPage from "../view/auth/Login";
import RegisterPage from "../view/auth/Register";
import ForgotPasswordPage from "../view/auth/ForgotPassword";
import Canvas from "../view/canvas";
import { authMiddleware } from "./middleware/auth";
import { canvasLayoutLoader, canvasLoader } from "./loader/canvas";
import NewCanvas from "../view/canvas/NewCanvas";

export const router = createBrowserRouter([
  {
    element: <GlobalLayout />,
    children: [
      {
        path: "/",
        element: <LandingPage />,
      },
      {
        path: "/login",
        element: <LoginPage />,
      },
      {
        path: "/register",
        element: <RegisterPage />,
      },
      {
        path: "/forgot-password",
        element: <ForgotPasswordPage />,
      },
      {
        path: "/about",
        element: <div>About</div>,
      },
      {
        path: "/canvas",
        element: <CanvasLayout />,
        loader: canvasLayoutLoader,
        middleware: [authMiddleware],
        children: [
          {
            index: true,
            element: <NewCanvas />,
          },
          {
            path: ":canvas_id",
            loader: canvasLoader,
            element: <Canvas />,
          },
          {
            path: "search",
            element: <div>Search Canvases</div>,
          },
          {
            path: "myresource",
            element: <div>My Resources</div>,
          }
        ],
      },
    ],
  },
]);