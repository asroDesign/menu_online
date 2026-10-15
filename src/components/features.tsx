"use client";

import { createContext, useContext, type ReactNode } from "react";
import { hasAny, type FeatureMap } from "@/lib/plans";

const Ctx = createContext<{ map: FeatureMap; role: string }>({ map: {}, role: "owner" });

export function FeaturesProvider({ features, role = "owner", children }: { features: FeatureMap; role?: string; children: ReactNode }) {
  return <Ctx.Provider value={{ map: features, role }}>{children}</Ctx.Provider>;
}

export function useFeatures() {
  const { map, role } = useContext(Ctx);
  return { map, role, isManager: role === "owner" || role === "manager", has: (k: string | string[]) => hasAny(map, k), level: (k: string) => map[k] ?? "no" };
}
