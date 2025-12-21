import { useContext } from "react";
import { StoreContext } from "@/app/provider";

export const useStores = () => {
    // useContext(StoreContext);
    return useContext(StoreContext);
};