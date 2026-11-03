import { describe, expect, it } from "vitest";
import { addDateOnlyDays, goalAttendanceDates, isValidDateOnly } from "../../shared/goal-dates";

describe("goal calendar dates", () => {
  it("validates real calendar dates and advances over leap day", () => {
    expect(isValidDateOnly("2026-11-03")).toBe(true);
    expect(isValidDateOnly("2026-02-29")).toBe(false);
    expect(isValidDateOnly("2028-02-29")).toBe(true);
    expect(addDateOnlyDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it.each([10, 20, 30, 60, 180, 365, 730])("creates exactly %i consecutive attendance dates", duration => {
    const dates = goalAttendanceDates("2026-11-03", duration);
    expect(dates).toHaveLength(duration);
    expect(dates[0]).toBe("2026-11-03");
    expect(dates[duration - 1]).toBe(addDateOnlyDays("2026-11-03", duration - 1));
    expect(new Set(dates).size).toBe(duration);
  });

  it("rejects invalid ranges rather than silently truncating them", () => {
    expect(() => goalAttendanceDates("2026-02-30", 10)).toThrow(RangeError);
    expect(() => goalAttendanceDates("2026-11-03", 731)).toThrow(RangeError);
  });
});
