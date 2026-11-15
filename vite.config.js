import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Two HTML entries: the simulator (index.html) and the archived research tools (research.html).
export default defineConfig({
  build: { rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), research: resolve(import.meta.dirname, 'research.html') } } },
});
