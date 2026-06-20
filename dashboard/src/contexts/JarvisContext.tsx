import { createContext, useContext, useState, type ReactNode } from "react";
import { useJarvis } from "@/hooks/useJarvis";

type JarvisContextValue = ReturnType<typeof useJarvis> & {
  panelOpen: boolean;
  setPanelOpen: (v: boolean) => void;
};

const JarvisContext = createContext<JarvisContextValue | null>(null);

export function JarvisProvider({ children }: { children: ReactNode }) {
  const jarvis = useJarvis({ autoConnect: false });
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <JarvisContext.Provider value={{ ...jarvis, panelOpen, setPanelOpen }}>
      {children}
    </JarvisContext.Provider>
  );
}

export function useJarvisContext() {
  const ctx = useContext(JarvisContext);
  if (!ctx) throw new Error("useJarvisContext must be used inside JarvisProvider");
  return ctx;
}
