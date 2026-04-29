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
    <Stack spacing={1.5} sx={{ mb: 2.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 700, color: "text.secondary", ml: 0.5 }}>
        {label}
      </Typography>
      <ToggleButtonGroup
        exclusive
        fullWidth
        value={value}
        onChange={(_event, nextValue: string | null) => {
          if (nextValue !== null) onChange(nextValue);
        }}
        aria-label={name ?? label}
      >
        {options.map((option) => (
          <ToggleButton
            key={option.value}
            value={option.value}
            aria-label={option.label}
            sx={{ flex: 1, py: 1 }}
          >
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Stack>
  );
}
