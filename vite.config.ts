import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import uniModule from '@dcloudio/vite-plugin-uni';

const uni = (uniModule as unknown as { default?: typeof uniModule }).default || uniModule;
const adminStatic = {
  name: 'wodi-admin-static',
  configureServer(server: { middlewares: { use: (path: string, handler: (request: any, response: any, next: () => void) => void) => void } }) {
    server.middlewares.use('/admin', (request, response, next) => {
      if (request.url === '/' || request.url === '') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(readFileSync('public/admin/index.html', 'utf8'));
      } else next();
    });
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'admin/index.html', source: readFileSync('public/admin/index.html', 'utf8') });
    this.emitFile({ type: 'asset', fileName: 'admin.html', source: readFileSync('public/admin.html', 'utf8') });
  },
};

export default defineConfig({
  plugins: [uni(), adminStatic],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // uni-app disables Vite file restrictions unless strict is explicitly enabled.
    fs: { strict: true, deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/server/**', '**/tests/**'] },
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/ws': { target: 'ws://127.0.0.1:3001', ws: true },
    },
  },
});
