import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  define: {
    global: 'globalThis', // Fix for SimplePeer
  },
  server: {
    host: '0.0.0.0', // Allow access from other devices
    port: 5173, // Ensure correct port
    https: {
      key: fs.readFileSync(path.resolve(__dirname, './certs/key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, './certs/cert.pem'))
    }
  },
  build: {
    outDir: 'dist',
  },
});
