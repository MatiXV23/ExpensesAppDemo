import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// base relativa + HashRouter: el build funciona en Netlify, Vercel o GitHub Pages (incluso en una subcarpeta) sin redirects.
export default defineConfig({ base: './', plugins: [react(), tailwindcss()], resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } }, build: { rollupOptions: { output: { manualChunks(id) { if (id.includes('node_modules')) { if (/recharts|d3-|victory/.test(id)) return 'charts'; if (/react-dom|react-router|\/react\/|scheduler/.test(id)) return 'react'; if (/radix-ui/.test(id)) return 'ui'; if (/zod|react-hook-form|hookform/.test(id)) return 'forms'; } } } } } });
