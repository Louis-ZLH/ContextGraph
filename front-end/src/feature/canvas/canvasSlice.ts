import { createSlice } from "@reduxjs/toolkit";

const canvasSlice = createSlice({
  name: "canvas",
  initialState: {
    canvasTitle: "Untitled Canvas",
  },
  reducers: {
    setCanvasTitle: (state, action) => {
      state.canvasTitle = action.payload;
    },
  },
});

export const { setCanvasTitle } = canvasSlice.actions;

export default canvasSlice.reducer;