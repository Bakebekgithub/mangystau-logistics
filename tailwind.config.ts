import type { Config } from "tailwindcss";

/**
 * Light, Swiss-minimal, grid-based — the reference being the sites people already
 * know from ride-hailing and delivery apps.
 *
 * Two decisions worth recording:
 *
 * 1. Light rather than dark. A dark canvas looked good on a laptop but washed out
 *    when projected in a lit room, and putting copy over a dark map made both
 *    unreadable. The map belongs inside the working screens, not behind text.
 *
 * 2. The `laden` / `empty` pair was chosen by running a palette validator, not by
 *    eye. Plain green against plain orange separates by only ΔE 7 under
 *    deuteranopia — for roughly one man in twelve, the single most important
 *    distinction in this product would have been invisible. This pair separates
 *    by 11.8 at worst, sits inside the light-mode lightness band, and clears 3:1
 *    contrast against white.
 *
 * The `ink` scale runs the conventional direction: 50 is the lightest surface,
 * 900 the darkest text.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#F7F9FC",
          100: "#EEF2F7",
          200: "#E1E7EF",
          300: "#CBD4E1",
          400: "#94A2B8",
          500: "#64748B",
          600: "#475569",
          700: "#334154",
          800: "#1E293B",
          900: "#0F172A",
        },
        /** Actions, links, brand. Never used to encode data. */
        brand: {
          DEFAULT: "#2563EB",
          hover: "#1D4ED8",
          press: "#1E40AF",
          soft: "#EFF5FF",
          border: "#BFD4FE",
        },
        /** A paid kilometre. */
        laden: {
          DEFAULT: "#0E8A6F",
          ink: "#0A6F59",
          soft: "#E7F6F1",
          border: "#A9DFD1",
        },
        /** An empty one — the cost the product exists to remove. */
        empty: {
          DEFAULT: "#C2560D",
          ink: "#9C440A",
          soft: "#FDF0E6",
          border: "#F5C9A3",
        },
        danger: { DEFAULT: "#DC2626", ink: "#B91C1C", soft: "#FEF2F2", border: "#FECACA" },
        warn: { DEFAULT: "#B45309", ink: "#92400E", soft: "#FFFBEB", border: "#FDE68A" },
      },
      fontFamily: {
        sans: [
          "Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI",
          "Roboto", "Helvetica Neue", "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        display: ["3rem", { lineHeight: "1.05", letterSpacing: "-0.035em", fontWeight: "700" }],
        h1: ["1.875rem", { lineHeight: "1.15", letterSpacing: "-0.025em", fontWeight: "700" }],
        h2: ["1.375rem", { lineHeight: "1.25", letterSpacing: "-0.018em", fontWeight: "650" }],
        h3: ["1.0625rem", { lineHeight: "1.35", letterSpacing: "-0.01em", fontWeight: "600" }],
        body: ["1rem", { lineHeight: "1.55" }],
        small: ["0.875rem", { lineHeight: "1.5" }],
        caption: ["0.6875rem", { lineHeight: "1.4", letterSpacing: "0.06em", fontWeight: "600" }],
        metric: ["1.75rem", { lineHeight: "1", letterSpacing: "-0.03em", fontWeight: "700" }],
        "metric-lg": ["2.5rem", { lineHeight: "1", letterSpacing: "-0.035em", fontWeight: "700" }],
      },
      borderRadius: {
        card: "16px",
        control: "10px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.06)",
        lift: "0 4px 12px -2px rgba(15,23,42,0.08), 0 12px 32px -8px rgba(15,23,42,0.12)",
        control: "0 1px 2px rgba(15,23,42,0.05)",
      },
      transitionTimingFunction: {
        swift: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(1.4)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to: { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        rise: "rise 0.32s cubic-bezier(0.32, 0.72, 0, 1) both",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        shimmer: "shimmer 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
