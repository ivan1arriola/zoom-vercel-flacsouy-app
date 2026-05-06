import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #1F4B8F 0%, #153363 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "120px",
          color: "white",
          fontFamily: "Inter, sans-serif",
          boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
        }}
      >
        {/* Simple Camera Icon */}
        <svg width="220" height="220" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 24 }}>
          <div style={{ fontSize: 56, fontWeight: 900, letterSpacing: "-1px" }}>FLACSO</div>
          <div style={{ fontSize: 40, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>Zoom APP</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
