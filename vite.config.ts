import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => ({ plugins: [react()], ...(mode === 'test' ? { define: { 'import.meta.env.VITE_SUPABASE_URL': '""', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '""' } } : {}), test: { environment: 'node', include: ['tests/**/*.test.ts'] } } as import('vitest/config').UserConfig));
