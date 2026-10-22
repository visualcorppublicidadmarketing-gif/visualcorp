import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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
  plugins: [react(), githubPagesFallback()],
  server: { port: 5173 },
});
