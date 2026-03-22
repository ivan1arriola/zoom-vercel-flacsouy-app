"use client";

import { useId } from "react";

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
  const fallbackName = useId();
  const groupName = name ?? fallbackName;

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
        {label}
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <label
            key={option.value}
            style={{
              position: "relative",
              padding: "8px 14px",
              border: "2px solid #ddd",
              borderRadius: 8,
              backgroundColor: value === option.value ? "var(--flacso-p1)" : "white",
              color: value === option.value ? "white" : "#333",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
              flex: "1 1 140px",
              textAlign: "center"
            }}
          >
            <input
              type="radio"
              name={groupName}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              style={{
                position: "absolute",
                opacity: 0,
                width: 0,
                height: 0,
                pointerEvents: "none"
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}
