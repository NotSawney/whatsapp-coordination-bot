import { defineConfig } from 'vitest/config';

// Suite opt-in: evals del agente contra el modelo real (OpenRouter). Lenta, consume tokens.
// Correr con: pnpm test:evals
export default defineConfig({
  test: {
    include: ['tests/evals/**/*.test.ts'],
    // Modelos free son lentos y cada eval hace varios round-trips; damos aire.
    testTimeout: 180_000,
    // Secuencial: evita gatillar rate-limits del modelo free corriendo en paralelo.
    fileParallelism: false,
  },
});
