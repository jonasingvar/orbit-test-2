import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Ports come from the environment so two checkouts can run side by side.
  // The proxy follows the API port; the frontend only ever fetches `/api/…`.
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    open: !process.env.CI && !process.env.NO_OPEN,
    proxy: {
      '/api': { target: `http://localhost:${process.env.PORT ?? 3001}`, changeOrigin: true },
    },
  },
});
