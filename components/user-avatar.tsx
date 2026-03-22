"use client";

import { useEffect, useState } from "react";

interface UserAvatarProps {
  firstName?: string | null;
  lastName?: string | null;
  image?: string | null;
  size?: number;
  className?: string;
}

export function UserAvatar({
  firstName,
  lastName,
  image,
  size = 36,
  className
}: UserAvatarProps) {
  const [imageLoadError, setImageLoadError] = useState(false);
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || "Usuario";

  useEffect(() => {
    setImageLoadError(false);
  }, [image]);

  const initials = `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();

  if (image && !imageLoadError) {
    return (
      <img
        src={image}
        alt={displayName}
        onError={() => setImageLoadError(true)}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          backgroundColor: "#e0e0e0"
        }}
        className={className}
      />
    );
  }

  if (initials) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: "#1d3a72",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: "bold",
          fontSize: Math.max(10, size * 0.4),
          flexShrink: 0
        }}
        className={className}
      >
        {initials}
      </div>
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: "#d1d5db",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#6b7280",
        fontWeight: "bold",
        fontSize: Math.max(10, size * 0.4),
        flexShrink: 0
      }}
      className={className}
    >
      ?
    </div>
  );
}
