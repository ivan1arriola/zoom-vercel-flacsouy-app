"use client";

interface ToggleButtonsProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: { value: string; label: string }[];
}

export function ToggleButtons({
  label,
  value,
  onChange,
  options = [
    { value: "SI", label: "Sí" },
    { value: "NO", label: "No" }
  ]
}: ToggleButtonsProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", marginBottom: 8, fontWeight: 500 }}>
        {label}
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            style={{
              padding: "8px 16px",
              border: "2px solid #ddd",
              borderRadius: 6,
              backgroundColor: value === option.value ? "#4f46e5" : "white",
              color: value === option.value ? "white" : "#333",
              fontWeight: 500,
              cursor: "pointer",
              transition: "all 0.2s",
              flex: 1,
              textAlign: "center"
            }}
            onMouseEnter={(e) => {
              if (value !== option.value) {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#999";
              }
            }}
            onMouseLeave={(e) => {
              if (value !== option.value) {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#ddd";
              }
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
