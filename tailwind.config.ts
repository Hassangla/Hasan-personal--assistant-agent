import type { Config } from "tailwindcss";

// Warm "command center" palette — the redesign (design handoff v0.3).
// Static tokens live here; per-area category colors are data-driven and applied
// via inline styles (see lib/areas.ts areaColor()), since they need dynamic
// alpha suffixes Tailwind can't enumerate.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // "Mission Control" dark command-deck palette (design handoff v0.4).
        // semantic surface + ink scale
        page: "#0C0D10",
        card: "#15171C",
        cardalt: "#101115",
        ink: "#F3F1EC",
        inkstrong: "#F3F1EC",
        ink2: "#A7ACB4",
        ink3: "#71767F",
        inkfaint: "#565B63",
        line: "#23272F",
        line2: "#1E2127",
        // brand + state — accent is signal lime; text on accent is #0C0D10.
        accent: "#C2F24C",
        good: "#43D3A2",
        amber: "#F3B24C",
        blue: "#5C8DF0",
        danger: "#FF6A45",

        // --- legacy aliases kept pointing at the live token values ---
        bg: "#0C0D10",
        panel: "#15171C",
        panel2: "#101115",
        border: "#23272F",
        borderlt: "#1E2127",
        text: "#F3F1EC",
        muted: "#A7ACB4",
        faint: "#71767F",
        hot: "#FF6A45",
        warm: "#F3B24C",
        cool: "#5C8DF0",
      },
      fontFamily: {
        // body / UI
        sans: ["'IBM Plex Sans'", "ui-sans-serif", "system-ui", "sans-serif"],
        // display / headings
        display: ["'Space Grotesk'", "ui-sans-serif", "system-ui", "sans-serif"],
        // labels / timestamps
        mono: ["'IBM Plex Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        serif: ["'Space Grotesk'", "ui-serif", "Georgia", "serif"],
      },
      boxShadow: {
        hero: "0 1px 0 rgba(255,255,255,0.02), 0 30px 60px -34px rgba(0,0,0,0.7)",
        card: "0 1px 0 rgba(255,255,255,0.02), 0 24px 48px -34px rgba(0,0,0,0.6)",
        soft: "0 1px 0 rgba(255,255,255,0.02), 0 14px 30px -28px rgba(0,0,0,0.55)",
        accent: "0 4px 16px -4px #C2F24C55",
      },
      keyframes: {
        pulse2: {
          "0%,100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: ".45", transform: "scale(.82)" },
        },
      },
      animation: {
        pulse2: "pulse2 2.4s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
