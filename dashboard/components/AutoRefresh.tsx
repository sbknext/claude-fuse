"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Silently refreshes server components every `intervalMs` while the tab is visible.
 * Also triggers on tab focus (visibilitychange).
 */
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    function refresh() {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }

    document.addEventListener("visibilitychange", refresh);
    const id = setInterval(refresh, intervalMs);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(id);
    };
  }, [router, intervalMs]);

  return null;
}
