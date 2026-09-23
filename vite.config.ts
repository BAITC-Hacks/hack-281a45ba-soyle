import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { soyleApiPlugin } from './server/api';

export default defineConfig(({ mode }) => {
  // Empty prefix is used only in Node. Vite still exposes only VITE_ variables to the client.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), soyleApiPlugin({
      mode: env.AI_MODE || 'mock',
      apiKey: env.OPENAI_API_KEY || '',
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
    })],
    test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
  };
});
