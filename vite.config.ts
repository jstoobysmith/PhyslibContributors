import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import site from './config/site.json' with { type: 'json' };

export default defineConfig({
  base: process.env.BASE_PATH ?? site.basePath,
  plugins: [react(), tailwindcss()],
});
