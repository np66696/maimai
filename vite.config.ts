import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  root: '.',
  publicDir: 'public',
  server: {
    port: 5174,
    open: true
  },
  test: {
    environment: 'node',
    globals: true,
    exclude: ['release/**', 'release-exe/**', 'android/**', '**/node_modules/**']
  }
});
