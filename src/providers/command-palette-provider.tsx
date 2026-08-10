"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

interface CommandPaletteCtxValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const CommandPaletteCtx = createContext<CommandPaletteCtxValue | null>(null);

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((o) => !o), []);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [toggle]);

  return (
    <CommandPaletteCtx.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </CommandPaletteCtx.Provider>
  );
}

export function useCommandPalette(): CommandPaletteCtxValue {
  const ctx = useContext(CommandPaletteCtx);
  if (!ctx) throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  return ctx;
}
