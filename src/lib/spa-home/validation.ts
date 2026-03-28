const EMAIL_LINE_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeDocentesCorreosByLine(raw: string): string | undefined {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return undefined;

  const unique = new Set<string>();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.includes(";") || line.includes(",")) {
      throw new Error(`Correos de docentes: usa un correo por linea (error en linea ${index + 1}).`);
    }
    if (!EMAIL_LINE_REGEX.test(line)) {
      throw new Error(`Correos de docentes: email invalido en linea ${index + 1}.`);
    }
    unique.add(line.toLowerCase());
  }

  return Array.from(unique.values()).join("\n");
}

