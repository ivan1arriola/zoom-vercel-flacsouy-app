"use client";

import Chip from "@mui/material/Chip";
import DoNotDisturbAltOutlinedIcon from "@mui/icons-material/DoNotDisturbAltOutlined";
import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import Groups2RoundedIcon from "@mui/icons-material/Groups2Rounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";

function buildAssistantLabel(name?: string | null, email?: string | null): string {
  const normalizedName = (name ?? "").trim();
  const normalizedEmail = (email ?? "").trim().toLowerCase();
  if (normalizedName && normalizedEmail) return `${normalizedName} (${normalizedEmail})`;
  if (normalizedName) return normalizedName;
  if (normalizedEmail) return normalizedEmail;
  return "";
}

interface MeetingAssistantStatusChipProps {
  requiresAssistance?: boolean | null;
  assistantName?: string | null;
  assistantEmail?: string | null;
  multipleAssistants?: boolean;
  size?: "small" | "medium";
  noAssistanceLabel?: string;
  pendingLabel?: string;
}

export function MeetingAssistantStatusChip({
  requiresAssistance,
  assistantName,
  assistantEmail,
  multipleAssistants = false,
  size = "small",
  noAssistanceLabel = "No aplica",
  pendingLabel = "Pendiente de asignacion"
}: MeetingAssistantStatusChipProps) {
  if (!requiresAssistance) {
    return (
      <Chip
        size={size}
        variant="outlined"
        color="default"
        icon={<DoNotDisturbAltOutlinedIcon fontSize="small" />}
        label={noAssistanceLabel}
      />
    );
  }

  if (multipleAssistants) {
    return (
      <Chip
        size={size}
        variant="outlined"
        color="info"
        icon={<Groups2RoundedIcon fontSize="small" />}
        label="Varios asistentes"
      />
    );
  }

  const assistantLabel = buildAssistantLabel(assistantName, assistantEmail);
  if (assistantLabel) {
    return (
      <Chip
        size={size}
        variant="outlined"
        color="success"
        icon={<CheckCircleOutlineRoundedIcon fontSize="small" />}
        label={assistantLabel}
      />
    );
  }

  return (
    <Chip
      size={size}
      color="warning"
      icon={<HourglassTopRoundedIcon fontSize="small" />}
      label={pendingLabel}
    />
  );
}
