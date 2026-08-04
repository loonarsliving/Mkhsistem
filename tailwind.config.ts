import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          border: "hsl(var(--sidebar-border))",
          accent: "hsl(var(--sidebar-accent))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-out": { from: { opacity: "1" }, to: { opacity: "0" } },
        "zoom-in": { from: { opacity: "0", transform: "scale(0.95)" }, to: { opacity: "1", transform: "scale(1)" } },
        "zoom-out": { from: { opacity: "1", transform: "scale(1)" }, to: { opacity: "0", transform: "scale(0.95)" } },
        "dialog-zoom-in": {
          from: { opacity: "0", transform: "translate(-50%, -50%) scale(0.95)" },
          to: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
        },
        "dialog-zoom-out": {
          from: { opacity: "1", transform: "translate(-50%, -50%) scale(1)" },
          to: { opacity: "0", transform: "translate(-50%, -50%) scale(0.95)" },
        },
        "slide-in-from-top": { from: { opacity: "0", transform: "translateY(-6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "slide-in-from-bottom": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "slide-in-from-left": { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(0)" } },
        "slide-out-to-left": { from: { transform: "translateX(0)" }, to: { transform: "translateX(-100%)" } },
        "slide-in-from-right": { from: { transform: "translateX(100%)" }, to: { transform: "translateX(0)" } },
        "slide-out-to-right": { from: { transform: "translateX(0)" }, to: { transform: "translateX(100%)" } },
        "slide-in-from-left-2": { from: { transform: "translateX(-6px)" }, to: { transform: "translateX(0)" } },
        "slide-in-from-right-2": { from: { transform: "translateX(6px)" }, to: { transform: "translateX(0)" } },
        "stagger-fade-in": { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        "fade-in": "fade-in 0.15s ease-out",
        "fade-out": "fade-out 0.15s ease-in",
        "zoom-in": "zoom-in 0.15s ease-out",
        "zoom-out": "zoom-out 0.1s ease-in",
        "dialog-zoom-in": "dialog-zoom-in 0.15s ease-out",
        "dialog-zoom-out": "dialog-zoom-out 0.1s ease-in",
        "slide-in-from-top": "slide-in-from-top 0.15s ease-out",
        "slide-in-from-bottom": "slide-in-from-bottom 0.15s ease-out",
        "slide-in-from-left": "slide-in-from-left 0.3s ease-out",
        "slide-out-to-left": "slide-out-to-left 0.2s ease-in",
        "slide-in-from-right": "slide-in-from-right 0.3s ease-out",
        "slide-out-to-right": "slide-out-to-right 0.2s ease-in",
        "slide-in-from-left-2": "slide-in-from-left-2 0.15s ease-out",
        "slide-in-from-right-2": "slide-in-from-right-2 0.15s ease-out",
        "stagger-fade-in": "stagger-fade-in 0.3s ease-out backwards",
      },
    },
  },
  plugins: [],
};

export default config;
