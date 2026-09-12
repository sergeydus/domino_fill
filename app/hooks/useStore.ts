import { useContext } from "react";
import { StoreContext } from "@/app/provider";

export const useStores = () => {
    const store = useContext(StoreContext);
    if (!store) {
        throw new Error("useStores must be used within a <StoreWrapper>");
    }
    return store;
};
