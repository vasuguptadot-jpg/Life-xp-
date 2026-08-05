import { useState, useEffect, useCallback } from "react";

export type StyleTheme = "glass" | "brutalism" | "maximalism" | "minimalism" | "cyberpunk";
export type ColorPalette = "obsidian" | "midnight" | "forest" | "violet" | "ember" | "rose";

export interface ThemeConfig {
  style: StyleTheme;
  palette: ColorPalette;
}

const STORAGE_KEY = "lifexp-theme";
const DEFAULT: ThemeConfig = { style: "glass", palette: "obsidian" };

function loadTheme(): ThemeConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT;
}

function applyTheme(config: ThemeConfig) {
  const el = document.documentElement;
  // Remove all theme/palette classes
  el.classList.remove(
    "theme-glass", "theme-brutalism", "theme-maximalism", "theme-minimalism", "theme-cyberpunk",
    "palette-obsidian", "palette-midnight", "palette-forest", "palette-violet", "palette-ember", "palette-rose",
  );
  el.classList.add(`theme-${config.style}`, `palette-${config.palette}`);
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeConfig>(() => loadTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Partial<ThemeConfig>) => {
    setThemeState(prev => {
      const updated = { ...prev, ...next };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      applyTheme(updated);
      return updated;
    });
  }, []);

  return { theme, setTheme };
}

// Initialize theme immediately (before React mounts) to avoid flash
export function initTheme() {
  applyTheme(loadTheme());
}
