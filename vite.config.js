import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import netlify from '@netlify/vite-plugin';

export default defineConfig({
  // The existing public/ folder contains the PHP router, not frontend assets.
  publicDir: false,
  plugins: [react(), {
    name: 'local-cookie-bridge', apply: 'serve',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        const setHeader = res.setHeader.bind(res);
        res.setHeader = (name, value) => {
          if (name.toLowerCase() === 'set-cookie' && res.hasHeader(name)) {
            return setHeader(name, [...[].concat(res.getHeader(name)), ...[].concat(value)]);
          }
          return setHeader(name, value);
        };
        next();
      });
    },
  }, netlify({ edgeFunctions: { enabled: false }, images: { enabled: false }, blobs: { enabled: false }, database: { enabled: false } }), { name: 'local-hmr-headers', apply: 'serve', configureServer(server) { server.middlewares.use((_req, res, next) => { res.removeHeader('Content-Security-Policy'); next(); }); } }],
  server: { port: 5173, strictPort: true, fs: { strict: true, deny: ['.env', '.env.*', '**/.git/**', '**/docs/**', '**/AGENTS.md', '**/config.local.php'] } },
  build: { sourcemap: false },
});
