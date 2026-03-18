import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FLACSO Zoom Salas",
    short_name: "ZoomSalas",
    description: "Sistema institucional para gestión de salas Zoom y asistentes.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1f6b5b",
    lang: "es-UY",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml"
      }
    ]
  };
}
