import { describe, expect, it } from "vitest";
import { MONTH_THEMES, themeForDate, themeForMonth, themeVars } from "@/lib/season";

describe("seasonal theme", () => {
  it("has one theme per Gregorian month", () => {
    expect(MONTH_THEMES.map((t) => t.month)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("maps months to northern-hemisphere seasons", () => {
    expect(themeForDate(new Date(2026, 0, 15)).season).toBe("winter");
    expect(themeForDate(new Date(2026, 3, 15)).season).toBe("spring");
    expect(themeForDate(new Date(2026, 6, 15)).season).toBe("summer");
    expect(themeForDate(new Date(2026, 9, 31))).toMatchObject({ name: "October", season: "autumn" });
    expect(themeForDate(new Date(2026, 11, 25)).emoji).toContain("🎄");
  });

  it("wraps month numbers", () => {
    expect(themeForMonth(12).name).toBe("January");
    expect(themeForMonth(-1).name).toBe("December");
  });

  it("emits valid colour tokens", () => {
    for (const t of MONTH_THEMES) {
      for (const v of Object.values(themeVars(t))) expect(v).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
    }
  });
});
