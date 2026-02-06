import { createContext } from "react-router";
import type { User } from "../service/type";

export const userContext = createContext<User | null>(null);