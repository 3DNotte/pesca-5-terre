import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  // host:true fa ascoltare Vite su tutte le interfacce di rete (non solo
  // localhost), cosi' e' raggiungibile anche dal telefono sulla stessa Wi-Fi.
  server: {
    host: true,
  },
})
