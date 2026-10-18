import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins:[react(),tailwindcss()],
  define:{'import.meta.env.VITE_NATIVE':JSON.stringify('true')},
  build:{outDir:'dist-native',rollupOptions:{input:'native.html'}},
  server:{port:1420,strictPort:true,host:'0.0.0.0'},
  clearScreen:false,
});
