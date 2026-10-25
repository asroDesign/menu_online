import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MenuPeak",
    short_name: "منوپیک",
    description: "پنل مدیریت کافه و رستوران",
    start_url: "/dashboard/waiter",
    scope: "/",
    display: "standalone",
    dir: "rtl",
    lang: "fa",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
