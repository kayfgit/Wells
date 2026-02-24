import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          globe: ['globe.gl'],
          geo: ['d3-geo', 'topojson-client'],
        },
      },
    },
  },
});
