import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  base: './',
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), guide: resolve(__dirname, 'guide.html') } } },                        // GitHub Pages 서브 경로(/japan-driving-sim/)에서도 동작
  server: {
    host: true,                      // 0.0.0.0 — 테일스케일(100.x) 인터페이스에도 바인딩
    port: 5173,
    open: false,
    allowedHosts: ['.ts.net'],       // MagicDNS 호스트명 허용 (Vite 6 DNS 리바인딩 보호)
  },
  preview: { host: true, port: 4173, allowedHosts: ['.ts.net'] },
});
