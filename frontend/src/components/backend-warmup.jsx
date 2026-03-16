"use client";

import { useEffect, useRef } from "react";

function getBackendBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_BACKEND_URL || "";
  return raw.replace(/\/+$/, "");
}

export default function BackendWarmup() {
  const hasWarmedUp = useRef(false);

  useEffect(() => {
    if (hasWarmedUp.current) {
      return;
    }

    hasWarmedUp.current = true;

    const baseUrl = getBackendBaseUrl();
    if (!baseUrl) {
      return;
    }

    const wake = async () => {
      try {
        await fetch(`${baseUrl}/health`, {
          method: "GET",
          cache: "no-store",
          mode: "cors",
          keepalive: true,
        });
      } catch {
        // Fallback ping to wake instances that may not have health route yet.
        try {
          await fetch(`${baseUrl}/api/auth/me`, {
            method: "GET",
            cache: "no-store",
            mode: "cors",
            credentials: "include",
            keepalive: true,
          });
        } catch {
          // Silent fail: warm-up should never interrupt UX.
        }
      }
    };

    void wake();
  }, []);

  return null;
}
