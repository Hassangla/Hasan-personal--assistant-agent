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
        // semantic surface + ink scale
        page: "#F4F1EA",
        card: "#FFFFFF",
        cardalt: "#FBF8F2",
        ink: "#221F1A",
        inkstrong: "#2C2820",
        ink2: "#6B6356",
        ink3: "#9A9182",
        inkfaint: "#AEA593",
        line: "#E9E2D5",
        line2: "#F1ECE1",
        // brand + state
        accent: "#C75F3F",
        good: "#2E8C61",
        amber: "#BC8638",
        blue: "#3C6FB0",
        danger: "#C04A2E",

        // --- legacy aliases (old dark tokens → warm equivalents) so any
        // not-yet-migrated component keeps reasonable colors ---
        bg: "#F4F1EA",
        panel: "#FFFFFF",
        panel2: "#FBF8F2",
        border: "#E9E2D5",
        borderlt: "#F1ECE1",
        text: "#221F1A",
        muted: "#6B6356",
        faint: "#9A9182",
        hot: "#C04A2E",
        warm: "#BC8638",
        cool: "#3C6FB0",
      },
      fontFamily: {
        // body / UI
        sans: ["'Hanken Grotesk'", "ui-sans-serif", "system-ui", "sans-serif"],
        // display / headings
        display: ["'Bricolage Grotesque'", "ui-sans-serif", "system-ui", "sans-serif"],
        // labels / timestamps
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        serif: ["'Bricolage Grotesque'", "ui-serif", "Georgia", "serif"],
      },
      boxShadow: {
        hero: "0 1px 0 rgba(0,0,0,0.02), 0 26px 50px -34px rgba(60,45,30,0.30)",
        card: "0 1px 0 rgba(0,0,0,0.02), 0 22px 44px -34px rgba(60,45,30,0.28)",
        soft: "0 1px 0 rgba(0,0,0,0.02), 0 14px 30px -28px rgba(60,45,30,0.3)",
        accent: "0 4px 12px -4px #C75F3F88",
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
