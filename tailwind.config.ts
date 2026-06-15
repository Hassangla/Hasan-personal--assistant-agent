import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0b0d10",
        panel: "#14181d",
        border: "#232a31",
        muted: "#8a97a3",
        accent: "#5b9dff",
      },
    },
  },
  plugins: [],
};

export default config;
