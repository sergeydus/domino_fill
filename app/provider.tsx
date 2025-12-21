"use client"
import { createContext, useContext, useEffect, useState } from "react";
import { rootStore } from "@/app/stores/RootStore";

export const StoreContext = createContext(rootStore);

export const StoreWrapper = ({ children }: { children: React.ReactNode }) => {
    return (
        <StoreContext.Provider value={rootStore}>
            {children}
        </StoreContext.Provider>
    );
};
