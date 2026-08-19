import type { Config } from "tailwindcss";

/**
 * One accent, two semantics, everything else neutral.
 *
 * The interface is dark for three reasons that are about this product rather
 * than fashion: routes and map geometry read best against a dark canvas; the
 * driver screen gets used in a cab, often at night; and it moves the product away
 * from the light-card dashboard look that reads as generic.
 *
 * `laden` and `empty` are not decoration — they are the product's whole argument
 * (a paid kilometre versus an empty one), so they are the only saturated colours
 * allowed near data.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Canvas and elevation. Cool, near-black, with a hint of blue so the
        // accent sits in the same family rather than fighting it.
        ink: {
          950: "#080A0F",
          900: "#0B0E14",
          850: "#11151D",
          800: "#161B25",
          750: "#1D2430",
          700: "#252E3C",
          600: "#33404F",
          500: "#4A5A6B",
          400: "#6B7C8F",
          300: "#94A3B4",
          200: "#BFCAD6",
          100: "#DFE6ED",
          50: "#F2F5F8",
        },
        // The single brand accent: movement, transport, "go".
        accent: {
          DEFAULT: "#19E5C4",
          hover: "#3DEDD1",
          press: "#0FC7AA",
          dim: "#0E7566",
          faint: "#0A2E2A",
        },
        /**
         * A paid kilometre, and an empty one.
         *
         * These two are the only saturated colours allowed near data, and the
         * pair was chosen by running the palette validator rather than by eye.
         * The obvious green/orange choice separates by only ΔE 7 under
         * deuteranopia — for roughly one man in twelve, the single most important
         * distinction in this product would have been unreadable. Teal against
         * orange separates by ΔE 14.8, and both steps sit inside the dark-mode
         * lightness band with ≥3:1 contrast against the canvas.
         *
         * `DEFAULT` is the fill step; `ink` is the lighter step used for text,
         * which needs more contrast than a fill does.
         */
        laden: {
          DEFAULT: "#11A896",
          ink: "#3BDCC4",
          dim: "#0B5E54",
          faint: "#08221F",
        },
        empty: {
          DEFAULT: "#DD6B12",
          ink: "#FF9E52",
          dim: "#7A3B0A",
          faint: "#241207",
        },
        danger: { DEFAULT: "#FF5C5C", faint: "#2E1214" },
        warn: { DEFAULT: "#FFC53D", faint: "#2E2410" },
      },
      fontFamily: {
        sans: [
          "-apple-system", "BlinkMacSystemFont", "Inter", "Segoe UI",
          "Roboto", "Helvetica Neue", "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        // A deliberate scale rather than ad-hoc sizes at call sites.
        "display": ["2.75rem", { lineHeight: "1.05", letterSpacing: "-0.03em", fontWeight: "600" }],
        "h1": ["2rem", { lineHeight: "1.12", letterSpacing: "-0.025em", fontWeight: "600" }],
        "h2": ["1.375rem", { lineHeight: "1.2", letterSpacing: "-0.02em", fontWeight: "600" }],
        "h3": ["1.0625rem", { lineHeight: "1.3", letterSpacing: "-0.01em", fontWeight: "600" }],
        "body": ["0.9375rem", { lineHeight: "1.55" }],
        "small": ["0.8125rem", { lineHeight: "1.5" }],
        "caption": ["0.6875rem", { lineHeight: "1.4", letterSpacing: "0.06em", fontWeight: "600" }],
        "metric": ["1.75rem", { lineHeight: "1", letterSpacing: "-0.03em", fontWeight: "650" }],
        "metric-lg": ["2.5rem", { lineHeight: "1", letterSpacing: "-0.035em", fontWeight: "650" }],
      },
      borderRadius: {
        card: "14px",
        control: "10px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.6)",
        lift: "0 2px 4px rgba(0,0,0,0.5), 0 16px 40px -16px rgba(0,0,0,0.7)",
        glow: "0 0 0 1px rgba(25,229,196,0.35), 0 8px 32px -8px rgba(25,229,196,0.25)",
      },
      transitionTimingFunction: {
        // One easing for everything, so motion feels like one system.
        swift: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      keyframes: {
        "draw-route": {
          from: { strokeDashoffset: "var(--route-length, 1000)" },
          to: { strokeDashoffset: "0" },
        },
        "rise": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(1.35)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to: { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "draw-route": "draw-route 1.1s cubic-bezier(0.32, 0.72, 0, 1) forwards",
        rise: "rise 0.28s cubic-bezier(0.32, 0.72, 0, 1) both",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        shimmer: "shimmer 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
