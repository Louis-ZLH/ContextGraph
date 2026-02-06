import { createSlice } from "@reduxjs/toolkit";

export type ThemeName = "saas" | "cyber" | "paper";

const getInitialTheme = (): ThemeName => {
  const stored = localStorage.getItem("theme");
  if (stored === "saas" || stored === "cyber" || stored === "paper") {
    return stored;
  }
  return "cyber";
};

const userSlice = createSlice({
  name: "user",
  initialState: {
    theme: getInitialTheme(),
  },
  reducers: {    
    changeTheme: (state, action: { payload: ThemeName }) => {
      state.theme = action.payload;
      localStorage.setItem("theme", action.payload);
      document.documentElement.setAttribute("data-theme", action.payload);
    },
  },
});

export const { changeTheme } = userSlice.actions;

export default userSlice.reducer;
