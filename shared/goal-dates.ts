export function isValidDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function addDateOnlyDays(value: string, amount: number): string {
  if (!isValidDateOnly(value) || !Number.isInteger(amount)) throw new RangeError("A valid calendar date and whole-day offset are required.");
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + amount));
  return `${result.getUTCFullYear()}-${String(result.getUTCMonth() + 1).padStart(2, "0")}-${String(result.getUTCDate()).padStart(2, "0")}`;
}

export function goalAttendanceDates(startDate: string, durationDays: number): string[] {
  if (!isValidDateOnly(startDate) || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 730) {
    throw new RangeError("A valid start date and goal duration from 1 to 730 days are required.");
  }
  return Array.from({ length: durationDays }, (_, index) => addDateOnlyDays(startDate, index));
}

export function dateOnlyFromTimestamp(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new RangeError("A valid timestamp is required.");
  return parsed.toISOString().slice(0, 10);
}
