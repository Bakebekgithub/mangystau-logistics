import type { Config } from "tailwindcss";

/**
 * Palette taken from the region itself: the limestone and clay of the Mangystau
 * steppe against the Caspian. Saturated accents are reserved for the two things
 * the product is about — empty running (loss) and loaded running (value).
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sand: {
          50: "#faf7f2",
          100: "#f3ede1",
          200: "#e6dac5",
          300: "#d4c09f",
          400: "#bfa176",
          500: "#a9885c",
          600: "#8d6f4b",
          700: "#71583e",
          800: "#5b4736",
          900: "#4a3b2f",
        },
        caspian: {
          50: "#eef8f8",
          100: "#d3ecec",
          200: "#a9d9db",
          300: "#75bfc3",
          400: "#469fa6",
          500: "#2b838b",
          600: "#216a73",
          700: "#1d555d",
          800: "#1b464d",
          900: "#193c42",
        },
        // Empty running: the cost the product exists to remove.
        empty: "#c2410c",
        // Loaded running: the value it creates.
        laden: "#15803d",
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
