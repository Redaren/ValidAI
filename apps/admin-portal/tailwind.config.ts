import type { Config } from "tailwindcss"
// @ts-ignore
import sharedConfig from "@playze/shared-config/tailwind/base.js"

const config: Config = {
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
    "../../packages/shared-ui/src/**/*.{ts,tsx}",
  ],
  presets: [sharedConfig],
}

export default config
