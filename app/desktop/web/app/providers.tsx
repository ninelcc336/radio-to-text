"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { getDesktopApi } from "../lib/desktop-api";
import { bindTasksStoreApi } from "../stores/tasks-store";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  useEffect(() => {
    bindTasksStoreApi(getDesktopApi());
  }, []);

  return <>{children}</>;
}
