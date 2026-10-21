"use client";

import { useEffect } from "react";
import { trackPlatformEvent } from "@/lib/platform-analytics";
import type { PublicPlatformFunnelEvent } from "@/lib/platform-events";

export function PlatformEventBeacon({ name }: { name: PublicPlatformFunnelEvent }) {
  useEffect(() => { trackPlatformEvent(name); }, [name]);
  return null;
}
