import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * REPONSES-ENREGISTREES-1 — runs ONE walk whose stand-in says what the real
 * Shop+ door never says. `test/rendu-harness.test.ts` runs it and requires it
 * to FAIL: that is the proof the harness's end-of-walk check is wired. The
 * file is `.fixture.tsx` so the app's own run never picks it up.
 */
export default defineConfig({
  root: fileURLToPath(new URL('../../..', import.meta.url)),
  test: {
    environment: 'node',
    include: ['test/fixtures/substitut-irreel/*.fixture.tsx'],
  },
});
