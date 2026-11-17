"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("tc-theme", next ? "dark" : "light");
    } catch {}
  }
  return (
    <button type="button" onClick={toggle} className={`btn btn-ghost px-3 ${className}`} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={dark}>
      {dark ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
    </button>
  );
}
