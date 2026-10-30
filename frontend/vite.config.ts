import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the site from /MediaChain/, not from the root.
  // The workflow sets VITE_BASE_PATH. Locally and on other hosts it stays "/".
  base: process.env.VITE_BASE_PATH ?? '/',
})