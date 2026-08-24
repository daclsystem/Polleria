import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/polleria/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: false,
    host: true,
  },
})
