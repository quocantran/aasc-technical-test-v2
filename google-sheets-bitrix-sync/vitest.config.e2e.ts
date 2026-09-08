import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    env: {
      BITRIX_WEBHOOK_URL: 'https://test.bitrix24.vn/rest/1/test/',
      GOOGLE_SHEET_ID: 'test_sheet_id',
    },
  },
});
