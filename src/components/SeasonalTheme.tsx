"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { MONTH_THEMES, THEME_STORAGE_KEY, themeForDate, themeForMonth, themeVars, type MonthTheme } from "@/lib/season";

const EVENT = "emotiv-theme";

/** "auto" follows the calendar; a number pins a month (handy for previewing). */
type Choice = "auto" | number;

function readChoice(): Choice {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v == null || v === "auto" ? "auto" : Number(v);
  } catch {
    return "auto";
  }
}

function resolve(choice: Choice): MonthTheme {
  return choice === "auto" ? themeForDate() : themeForMonth(choice);
}

export function useSeasonalTheme() {
  const [choice, setChoice] = useState<Choice>("auto");
  useEffect(() => {
    setChoice(readChoice());
    const on = () => setChoice(readChoice());
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const update = (c: Choice) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, String(c));
    } catch {
      // Storage blocked: the choice still applies for this page view.
    }
    setChoice(c);
    window.dispatchEvent(new Event(EVENT));
  };
  return { choice, theme: resolve(choice), setChoice: update };
}

/**
 * Applies the month's colours to the page and draws the seasonal backdrop.
 * The server already rendered the current month's variables, so this only
 * changes anything when the user has pinned a different month.
 */
export function SeasonalTheme() {
  const { theme } = useSeasonalTheme();
  useEffect(() => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(themeVars(theme))) root.style.setProperty(k, v);
    root.dataset.season = theme.season;
  }, [theme]);
  return <div aria-hidden className="seasonal-backdrop pointer-events-none fixed inset-0 -z-10" />;
}

/** Drifting emoji for the dashboard header. */
export function SeasonalEmoji() {
  const { theme } = useSeasonalTheme();
  return (
    <span aria-hidden className="inline-flex gap-1.5 text-2xl">
      {theme.emoji.map((e, i) => (
        <motion.span
          key={`${theme.month}-${i}`}
          initial={{ opacity: 0, y: 8, rotate: -10 }}
          animate={{ opacity: 1, y: [0, -4, 0], rotate: 0 }}
          transition={{
            opacity: { delay: i * 0.08 },
            rotate: { delay: i * 0.08 },
            y: { duration: 3 + i * 0.6, repeat: Infinity, ease: "easeInOut", delay: i * 0.3 },
          }}
        >
          {e}
        </motion.span>
      ))}
    </span>
  );
}

export function ThemePicker() {
  const { choice, theme, setChoice } = useSeasonalTheme();
  return (
    <label className="flex items-center gap-2 text-xs text-ink-400">
      <span className="hidden sm:inline">Theme</span>
      <select
        className="field w-auto! py-1! text-xs"
        value={String(choice)}
        onChange={(e) => setChoice(e.target.value === "auto" ? "auto" : Number(e.target.value))}
      >
        <option value="auto">
          Auto · {themeForDate().name} {themeForDate().emoji[0]}
        </option>
        {MONTH_THEMES.map((t) => (
          <option key={t.month} value={t.month}>
            {t.name} {t.emoji[0]}
          </option>
        ))}
      </select>
      <span className="capitalize text-ink-500">{theme.season}</span>
    </label>
  );
}
