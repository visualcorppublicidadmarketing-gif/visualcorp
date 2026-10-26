import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';

function githubPagesFallback() {
  return {
    name: 'github-pages-fallback',
    closeBundle() {
      const dist = path.resolve(process.cwd(), 'dist');
      const indexFile = path.join(dist, 'index.html');
      if (fs.existsSync(indexFile)) fs.copyFileSync(indexFile, path.join(dist, '404.html'));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), githubPagesFallback()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/]react(?:-dom)?[\\/]/, priority: 20 },
            { name: 'supabase-vendor', test: /node_modules[\\/]@supabase[\\/]/, priority: 15 },
            { name: 'editor-vendor', test: /node_modules[\\/](@tiptap|prosemirror)[\\/]/, priority: 12 },
            { name: 'pdf-vendor', test: /node_modules[\\/]jspdf[\\/]/, priority: 10 },
            { name: 'router-vendor', test: /node_modules[\\/]react-router(?:-dom)?[\\/]/, priority: 8 },
          ],
        },
      },
    },
  },
  server: { port: 5173 },
});
