"use client";

import { Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";

interface ToggleButtonsProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: { value: string; label: string }[];
  name?: string;
}

export function ToggleButtons({
  label,
  value,
  onChange,
  name,
  options = [
    { value: "SI", label: "Si" },
    { value: "NO", label: "No" }
  ]
}: ToggleButtonsProps) {
  return (
    <Stack spacing={1} sx={{ mb: 2 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <ToggleButtonGroup
        exclusive
        value={value}
        onChange={(_event, nextValue: string | null) => {
          if (nextValue !== null) onChange(nextValue);
        }}
        aria-label={name ?? label}
        sx={{
          flexWrap: "wrap",
          gap: 1,
          "& .MuiToggleButton-root": {
            px: 1.5,
            py: 0.75,
            minWidth: 120,
            borderRadius: 2,
            textTransform: "none",
            fontWeight: 600,
            borderColor: "divider"
          }
        }}
      >
        {options.map((option) => (
          <ToggleButton
            key={option.value}
            value={option.value}
            aria-label={option.label}
          >
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Stack>
  );
}
