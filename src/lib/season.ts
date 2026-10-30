/**
 * Seasonal UI theme: accent colours, background tint and emoji change with
 * the Gregorian month. Seasons follow the northern hemisphere.
 */

export type Season = "winter" | "spring" | "summer" | "autumn";

export type MonthTheme = {
  month: number; // 0 = January
  name: string;
  season: Season;
  emoji: [string, string, string];
  accent: string;
  accent2: string;
  /** Near-black page background with a hint of the month's colour. */
  base: string;
};

export const MONTH_THEMES: MonthTheme[] = [
  { month: 0, name: "January", season: "winter", emoji: ["❄️", "⛄", "🎆"], accent: "#5cc8ff", accent2: "#b8a6ff", base: "#070a10" },
  { month: 1, name: "February", season: "winter", emoji: ["💘", "❄️", "🌹"], accent: "#ff4d8d", accent2: "#ffb3c7", base: "#0c070b" },
  { month: 2, name: "March", season: "spring", emoji: ["🌱", "🌷", "🐣"], accent: "#4cd38a", accent2: "#ffd166", base: "#070c09" },
  { month: 3, name: "April", season: "spring", emoji: ["🌸", "🌦️", "🐝"], accent: "#ff8fc7", accent2: "#8be0a4", base: "#0b080b" },
  { month: 4, name: "May", season: "spring", emoji: ["🌼", "🌿", "🦋"], accent: "#ffd23f", accent2: "#6be3c1", base: "#0a0a07" },
  { month: 5, name: "June", season: "summer", emoji: ["☀️", "🌊", "🍉"], accent: "#ffb000", accent2: "#00d1e0", base: "#0a0907" },
  { month: 6, name: "July", season: "summer", emoji: ["🏖️", "🍦", "🌴"], accent: "#ff6b4a", accent2: "#3fd0ff", base: "#0b0807" },
  { month: 7, name: "August", season: "summer", emoji: ["🌻", "🍑", "🌅"], accent: "#ff9e3d", accent2: "#ff5e7e", base: "#0b0807" },
  { month: 8, name: "September", season: "autumn", emoji: ["🍎", "🍂", "📚"], accent: "#e2683c", accent2: "#e8b04b", base: "#0b0807" },
  { month: 9, name: "October", season: "autumn", emoji: ["🎃", "🍂", "🦇"], accent: "#ff7a1a", accent2: "#a06bff", base: "#0a070c" },
  { month: 10, name: "November", season: "autumn", emoji: ["🍁", "🌰", "☕"], accent: "#e08a3c", accent2: "#d4574a", base: "#0b0807" },
  { month: 11, name: "December", season: "winter", emoji: ["🎄", "❄️", "✨"], accent: "#ff4757", accent2: "#2ed3b7", base: "#08090b" },
];

export function themeForDate(date = new Date()): MonthTheme {
  return MONTH_THEMES[date.getMonth()];
}

export function themeForMonth(month: number): MonthTheme {
  return MONTH_THEMES[((month % 12) + 12) % 12];
}

/** CSS custom properties that override the Tailwind theme tokens. */
export function themeVars(t: MonthTheme): Record<string, string> {
  return {
    "--color-accent": t.accent,
    "--color-accent-soft": `${t.accent}26`,
    "--color-cyan": t.accent2,
    "--color-ink-950": t.base,
  };
}

export const THEME_STORAGE_KEY = "emotiv:theme-month";
