"use client";

import { createElement, useEffect } from "react";

/** Google <model-viewer> web component wrapper (3D + AR on mobile). */
export function ModelViewer({ src, height = 320 }: { src: string; height?: number }) {
  useEffect(() => {
    if (!document.querySelector("script[data-mv]")) {
      const s = document.createElement("script");
      s.type = "module";
      s.dataset.mv = "1";
      s.src = "https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js";
      document.head.appendChild(s);
    }
  }, []);
  return createElement("model-viewer", {
    src,
    ar: true,
    "ar-modes": "webxr scene-viewer quick-look",
    "camera-controls": true,
    "auto-rotate": true,
    "shadow-intensity": "1",
    style: { width: "100%", height, background: "#f5f5f4", borderRadius: 16 },
  });
}
