import { defineConfig } from 'vite';
import { resolve } from 'path';
import { builtinModules } from 'module';

export default defineConfig({
  build: {
    outDir: 'dist',
    target: 'node18',
    lib: {
      entry: {
        main: resolve(__dirname, 'src/main/index.ts'),
        preload: resolve(__dirname, 'src/preload/index.ts'),
      },
      formats: ['cjs'],
    },
    rollupOptions: {
      external: [
        'electron',
        'electron-updater',
        'electron-log',
        ...builtinModules,
        ...builtinModules.map(m => `node:${m}`),
      ],
      output: {
        entryFileNames: '[name]/index.js',
      },
    },
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@main': resolve(__dirname, 'src/main'),
      '@preload': resolve(__dirname, 'src/preload'),
    },
  },
});
