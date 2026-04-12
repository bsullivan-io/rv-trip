import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

export const chakraSystem = createSystem(
  defaultConfig,
  defineConfig({
    globalCss: {
      html: {
        bg: "#eef4fb",
        color: "#10233f"
      },
      body: {
        bg: "#eef4fb",
        color: "#10233f",
        fontSize: "sm",
        lineHeight: "1.45"
      },
      a: {
        color: "#1f4f8f"
      },
      "*": {
        borderRadius: "0 !important"
      }
    },
    theme: {
      breakpoints: {
        sm: "30rem",
        md: "48rem",
        lg: "64rem",
        xl: "80rem"
      },
      tokens: {
        colors: {
          brand: {
            50: { value: "#f3f8ff" },
            100: { value: "#dce9fb" },
            200: { value: "#bdd3f3" },
            300: { value: "#8db2e5" },
            400: { value: "#5c8fcd" },
            500: { value: "#285f9f" },
            600: { value: "#1d4f8f" },
            700: { value: "#163f74" },
            800: { value: "#c62839" },
            900: { value: "#10233f" }
          }
        },
        fonts: {
          heading: { value: "'Avenir Next', 'Segoe UI', sans-serif" },
          body: { value: "'Avenir Next', 'Segoe UI', sans-serif" }
        },
        fontSizes: {
          xs: { value: "0.68rem" },
          sm: { value: "0.8rem" },
          md: { value: "0.9rem" },
          lg: { value: "1rem" },
          xl: { value: "1.18rem" },
          "2xl": { value: "1.45rem" },
          "3xl": { value: "1.85rem" }
        },
        radii: {
          none: { value: "0" },
          xs: { value: "0" },
          sm: { value: "0" },
          md: { value: "0" },
          lg: { value: "0" },
          xl: { value: "0" },
          "2xl": { value: "0" },
          full: { value: "0" }
        },
        shadows: {
          md: { value: "0 12px 30px rgba(0, 0, 0, 0.25)" },
          lg: { value: "0 18px 40px rgba(0, 0, 0, 0.28)" }
        }
      },
      semanticTokens: {
        colors: {
          bg: { value: "#eef4fb" },
          panel: { value: "rgba(255, 255, 255, 0.86)" },
          panelSolid: { value: "#ffffff" },
          border: { value: "rgba(16, 35, 63, 0.14)" },
          text: { value: "#10233f" },
          muted: { value: "rgba(16, 35, 63, 0.68)" },
          accent: { value: "#1d4f8f" },
          accentStrong: { value: "#c62839" },
          success: { value: "#285f9f" }
        }
      }
    }
  })
);
