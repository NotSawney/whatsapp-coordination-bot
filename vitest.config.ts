import { defineConfig } from 'vitest/config';

// Suite determinista: dominio + tools. Excluye evals (lentas/flaky contra el modelo).
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/evals/**', 'node_modules/**'],
  },
});
