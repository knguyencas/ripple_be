const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(value: unknown): value is string {
  return typeof value === 'string' && LOCAL_DATE_RE.test(value);
}

export function parseLocalDate(value: unknown): Date | null {
  if (!isLocalDate(value)) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

export function toDateOnlyUTC(value: string | Date): Date {
  const date = typeof value === 'string' ? new Date(value) : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function dateKeyUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function daysBetweenDateKeys(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00.000Z`).getTime();
  const b = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86400000);
}
