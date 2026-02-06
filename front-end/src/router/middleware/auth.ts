import { redirect } from "react-router";
import { userContext } from "../context";
import { queryClient } from "../../query";
import { userProfileQueryOptions } from "../../query/user";
//import { toast } from "react-hot-toast";
import type { LoaderFunctionArgs } from "react-router";

export async function authMiddleware({ context }: LoaderFunctionArgs) {
    try {
        const { success, data: user } = await queryClient.ensureQueryData(userProfileQueryOptions);
        if(!success || !user) {
            //toast.error(message);
            throw redirect("/login");
        }
        context.set(userContext, user);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
        throw redirect("/login");
    }
  }