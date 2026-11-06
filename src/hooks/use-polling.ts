"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `fn` right away and then every `intervalMs` while the tab is visible.
 * Used for analyst replies / handoff changes (a simple, robust alternative to websockets for this scope).
 */
export function usePolling(fn: (() => unknown) | null, intervalMs: number): void {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const enabled = fn !== null;
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "visible") void fnRef.current?.();
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [enabled, intervalMs]);
}
