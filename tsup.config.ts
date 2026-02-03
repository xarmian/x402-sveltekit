import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  external: ['@sveltejs/kit', '@x402/core', '@x402/evm', '@x402/svm', '@x402/avm'],
});
