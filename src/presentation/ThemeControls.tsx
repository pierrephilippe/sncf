"use client";

import { Eye, Moon, SunDim } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const BRIGHTNESS_STORAGE_KEY = "sncf-accessibilite:brightness-dim";
const DEFAULT_DIM_LEVEL = 12;

export function ThemeControls() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [dimLevel, setDimLevel] = useState(DEFAULT_DIM_LEVEL);

  useEffect(() => {
    setMounted(true);
    const storedValue = window.localStorage.getItem(BRIGHTNESS_STORAGE_KEY);
    const storedLevel = Number(storedValue);
    const nextLevel = storedValue !== null && Number.isFinite(storedLevel) ? storedLevel : DEFAULT_DIM_LEVEL;

    if (storedValue === null) {
      window.localStorage.setItem(BRIGHTNESS_STORAGE_KEY, String(DEFAULT_DIM_LEVEL));
    }

    setDimLevel(nextLevel);
    document.documentElement.style.setProperty("--screen-dimmer-opacity", String(nextLevel / 100));
  }, []);

  const updateDimLevel = (value: number) => {
    setDimLevel(value);
    window.localStorage.setItem(BRIGHTNESS_STORAGE_KEY, String(value));
    document.documentElement.style.setProperty("--screen-dimmer-opacity", String(value / 100));
  };

  if (!mounted) return null;

  const isClassic = resolvedTheme === "classic";

  return (
    <div className="theme-controls" aria-label="Preferences d'affichage">
      <button
        className="button-secondary"
        type="button"
        aria-pressed={isClassic}
        onClick={() => setTheme(isClassic ? "achromatopsia" : "classic")}
      >
        <span className="button-content">
          {isClassic ? <Moon aria-hidden="true" /> : <Eye aria-hidden="true" />}
          <span>{isClassic ? "MODE SOMBRE" : "MODE CLAIR"}</span>
        </span>
      </button>

      <label className="brightness-control">
        <span className="brightness-label">
          <SunDim aria-hidden="true" />
          <span>Luminosite reduite</span>
        </span>
        <input
          type="range"
          min="0"
          max="35"
          step="5"
          value={dimLevel}
          onChange={(event) => updateDimLevel(Number(event.target.value))}
        />
      </label>
    </div>
  );
}
