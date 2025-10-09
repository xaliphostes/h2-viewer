import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [],
    root: './',
    publicDir: 'public',
    base: '/h2-viewer/', // must match your GitHub repo name
    build: {
        outDir: 'dist'
    }
});