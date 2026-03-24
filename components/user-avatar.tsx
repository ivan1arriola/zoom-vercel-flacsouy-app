"use client";

import { Avatar } from "@mui/material";

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
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || "Usuario";
  const initials = `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "?";

  return (
    <Avatar
      src={image ?? undefined}
      alt={displayName}
      className={className}
      imgProps={{ referrerPolicy: "no-referrer", crossOrigin: "anonymous" }}
      sx={{
        width: size,
        height: size,
        bgcolor: image ? undefined : "primary.main",
        fontWeight: 700,
        fontSize: Math.max(10, size * 0.38),
        flexShrink: 0
      }}
    >
      {initials}
    </Avatar>
  );
}
