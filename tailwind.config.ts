import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          yellow: "#F5B800",
          "yellow-dark": "#D99E00",
          "yellow-light": "#FFE27A",
          charcoal: "#1C1C1E",
          coal: "#111113",
          cream: "#F3E9D2",
          "cream-light": "#FAF5EA",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.06)",
        panel: "0 10px 40px rgba(0,0,0,0.25)",
      },
    },
  },
  plugins: [],
} satisfies Config;
