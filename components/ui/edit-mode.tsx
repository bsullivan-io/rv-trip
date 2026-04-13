"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLock, faLockOpen } from "@fortawesome/free-solid-svg-icons";

const STORAGE_KEY = "make-a-mile-edit-unlocked";

type EditModeContextValue = {
  isUnlocked: boolean;
  setIsUnlocked: (value: boolean) => void;
};

const EditModeContext = createContext<EditModeContextValue | null>(null);

export function EditModeProvider({ children }: { children: ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "true") {
      setIsUnlocked(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, isUnlocked ? "true" : "false");
    document.documentElement.dataset.editUnlocked = isUnlocked ? "true" : "false";
    return () => {
      delete document.documentElement.dataset.editUnlocked;
    };
  }, [isUnlocked]);

  const value = useMemo(() => ({ isUnlocked, setIsUnlocked }), [isUnlocked]);

  return <EditModeContext.Provider value={value}>{children}</EditModeContext.Provider>;
}

export function useEditMode() {
  const context = useContext(EditModeContext);
  if (!context) {
    throw new Error("useEditMode must be used within EditModeProvider.");
  }
  return context;
}

export function HeaderEditModeControl() {
  const { isUnlocked, setIsUnlocked } = useEditMode();

  return (
    <button
      className={isUnlocked ? "button icon-button header-lock-button" : "button-secondary icon-button header-lock-button"}
      type="button"
      onClick={() => setIsUnlocked(!isUnlocked)}
      title={isUnlocked ? "Lock editing" : "Unlock editing"}
      aria-label={isUnlocked ? "Lock editing" : "Unlock editing"}
    >
      <FontAwesomeIcon icon={isUnlocked ? faLockOpen : faLock} />
    </button>
  );
}

export function EditModeGate({
  enabled,
  children,
  fallback = null
}: {
  enabled: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { isUnlocked } = useEditMode();

  if (!enabled || !isUnlocked) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
