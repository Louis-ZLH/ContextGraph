import { createSlice } from "@reduxjs/toolkit";

export type ThemeName = "saas" | "dark" | "paper";

const getInitialTheme = (): ThemeName => {
  const stored = localStorage.getItem("theme");
  if (stored === "saas" || stored === "dark" || stored === "paper") {
    return stored;
  }
  return "paper";
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
