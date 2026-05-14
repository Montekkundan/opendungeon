"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const themeOptions = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
] as const;

export function nextThemeValue(theme: string | undefined) {
  const currentIndex = themeOptions.findIndex(
    (option) => option.value === theme
  );
  return (
    themeOptions[(currentIndex + 1) % themeOptions.length]?.value ?? "system"
  );
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function ThemeHotkey() {
  const { setTheme, theme } = useTheme();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key.toLowerCase() !== "d") {
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      setTheme(nextThemeValue(theme));
    }

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [setTheme, theme]);

  return null;
}

export function ThemeSwitcher() {
  const { setTheme, theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeTheme = mounted ? (theme ?? "system") : "system";

  return (
    <fieldset data-component="theme-switcher">
      <legend>Theme</legend>
      {themeOptions.map((option) => (
        <button
          aria-pressed={activeTheme === option.value}
          data-active={activeTheme === option.value || undefined}
          key={option.value}
          onClick={() => setTheme(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}
