import { defineConfig, type PluginOption } from "vite"
import { nitro } from "nitro/vite"
import { solidStart } from "@solidjs/start/config"

export default defineConfig({
  plugins: [solidStart() as PluginOption, nitro()],
  server: {
    allowedHosts: true,
  },
})
