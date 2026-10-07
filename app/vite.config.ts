import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'plugin-inspect-react-code'
import { settlementVerifier } from './scripts/settlement-verifier-plugin'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    target: ['es2018', 'chrome87', 'safari13', 'firefox78', 'edge88'],
  },
  plugins: [inspectAttr(), react(), settlementVerifier()],
  server: {
    port: 3000,
    hmr: process.env.L0_VERIFY === '1' ? false : undefined,
    // Verification captures/browser profiles must not reload a running scene.
    watch: { ignored: ['**/.cache/**', '**/reports/**'] },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
