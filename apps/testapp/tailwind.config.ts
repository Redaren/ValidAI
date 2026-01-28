import type { Config } from "tailwindcss"
// @ts-ignore
import sharedConfig from "@playze/shared-config/tailwind/base.js"

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/shared-ui/src/**/*.{js,ts,jsx,tsx}",
  ],
  presets: [sharedConfig],
}

export default config
