"use client";

import dynamic from "next/dynamic";

export type { LatLng } from "@/components/map-picker-inner";
export const MapPicker = dynamic(() => import("@/components/map-picker-inner"), {
  ssr: false,
  loading: () => <div className="skeleton h-64 w-full rounded-2xl" />,
});
