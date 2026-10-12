import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const host = process.argv[2] ?? '0.0.0.0';
const port = Number(process.argv[3] ?? '10');
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('El puerto debe estar entre 1 y 65535.');
}

const server = await preview({
  root: fileURLToPath(new URL('..', import.meta.url)),
  preview: {
    host,
    port,
    strictPort: true,
    // Preserve the browser's host so API origin checks and session cookies
    // continue to work on the same address as the published application.
    proxy: { '/api': { target: 'http://127.0.0.1:5106', changeOrigin: false } },
  },
});

server.printUrls();
