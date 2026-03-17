export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

const defaultNumberFormat = new Intl.NumberFormat("en-US")

export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  if (!options) return defaultNumberFormat.format(value)
  return new Intl.NumberFormat("en-US", options).format(value)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function coerceNullableNumber(value: number | string | null | undefined) {
  if (value == null || value === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function coerceNullableString(value: number | string | null | undefined) {
  if (value == null || value === '') {
    return null
  }

  return String(value)
}