/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: "#0c0d0e",
        surface: {
          DEFAULT: "#131518",
          subtle: "#181a1f",
          border: "#252830",
          hover: "#1e2127",
        },
        ink: {
          DEFAULT: "#f3f4f6",
          muted: "#9ca3af",
          dim: "#6b7280",
        },
        brand: {
          amber: "#f59e0b",
          emerald: "#10b981",
          crimson: "#ef4444",
        },
      },
      fontFamily: {
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
        sans: [
          "Geist",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
      borderRadius: {
        DEFAULT: "4px",
        sm: "2px",
        md: "6px",
      },
    },
  },
  plugins: [],
};
