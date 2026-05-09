"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("claude-fuse-theme");
    if (stored === "dark") {
      document.documentElement.classList.add("dark");
      setDark(true);
    }
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("claude-fuse-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("claude-fuse-theme", "light");
    }
  }

  return (
    <button
      onClick={toggle}
      title="Toggle dark mode"
      className="rounded px-2 py-1 text-sm bg-gray-100 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
    >
      {dark ? "☀ Light" : "☾ Dark"}
    </button>
  );
}
