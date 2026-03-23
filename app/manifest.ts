import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FLACSO Zoom Salas",
    short_name: "ZoomSalas",
    description: "Herramienta para coordinar salas Zoom y asistentes.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1f6b5b",
    lang: "es-UY",
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon"
      }
    ]
  };
}
