"use client";

import { useEffect } from "react";
import { SystemErrorScreen } from "@/components/system-error-screen";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: "error", event: "ui.route_error", message: error.message, digest: error.digest }));
  }, [error]);

  return <SystemErrorScreen variant="server" onRetry={reset} errorDigest={error.digest} />;
}
