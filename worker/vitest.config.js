import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';

export default defineConfig({
  test: {
    provide: { contextMigration: readFileSync(new URL('./migrations/0001_context_memory.sql', import.meta.url), 'utf8') }
  },
  plugins: [
    cloudflareTest({
      miniflare: { d1Databases: ['CONTEXT_DB'] },
      wrangler: { configPath: './wrangler.jsonc' }
    })
  ]
});
