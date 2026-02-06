import { configureStore } from "@reduxjs/toolkit";
import userReducer from "./feature/user/userSlice.ts";
import canvasReducer from "./feature/canvas/canvasSlice.ts";

export const store = configureStore({
  reducer: {
    user: userReducer,
    canvas: canvasReducer,
  },
});

export default store;
