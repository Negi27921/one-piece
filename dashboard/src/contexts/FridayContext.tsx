import { createContext, useContext, useState, type ReactNode } from "react";
import { useFriday } from "@/hooks/useFriday";

type FridayContextValue = ReturnType<typeof useFriday> & {
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
};

const FridayContext = createContext<FridayContextValue | null>(null);

export function FridayProvider({ children }: { children: ReactNode }) {
  const friday = useFriday({ autoConnect: false });
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <FridayContext.Provider value={{ ...friday, panelOpen, setPanelOpen }}>
      {children}
    </FridayContext.Provider>
  );
}

export function useFridayContext() {
  const ctx = useContext(FridayContext);
  if (!ctx) throw new Error("useFridayContext must be used inside FridayProvider");
  return ctx;
}
