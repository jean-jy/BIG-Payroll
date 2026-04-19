import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        display: ["Syne", "sans-serif"],
        body: ["DM Sans", "sans-serif"],
        mono: ["Space Mono", "monospace"],
      },
      colors: {
        ink: {
          950: "#04080F",
          900: "#070D1A",
          800: "#0D1526",
          700: "#131E35",
          600: "#1A2744",
          500: "#243357",
        },
        border: "#1E2D4A",
        teal: {
          DEFAULT: "#0D9488",
          light: "#2DD4BF",
          dim: "#042F2E",
        },
        branch: {
          a: "#0D9488",
          b: "#6366F1",
          c: "#F43F5E",
        },
      },
      backgroundImage: {
        "dot-grid":
          "radial-gradient(circle, #1A2744 1px, transparent 1px)",
      },
      backgroundSize: {
        "dot-24": "24px 24px",
      },
    },
  },
  plugins: [],
};

export default config;
