import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0'
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replace(/\\/g, '/');
          if (moduleId.indexOf('/node_modules/three-stdlib/') !== -1) return 'three-stdlib-vendor';
          if (moduleId.indexOf('/node_modules/three/') !== -1) return 'three-vendor';
          if (moduleId.indexOf('/node_modules/@react-three/fiber/') !== -1) return 'fiber-vendor';
          if (moduleId.indexOf('/node_modules/recharts/') !== -1) return 'recharts-vendor';
          const d3Package = moduleId.match(/\/node_modules\/(d3-[^/]+)\//)?.[1];
          if (d3Package) return `${d3Package}-vendor`;
        }
      }
    }
  }
});
