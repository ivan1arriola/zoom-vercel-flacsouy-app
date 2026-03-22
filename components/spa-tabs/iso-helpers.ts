// Temporary wrapper file to fix toIso issue
export function toIsoWrapper(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${value} es una fecha invalida.`);
  }
  return parsed.toISOString();
}
