import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** 백엔드 주소 — localhost 대신 127.0.0.1 (Windows IPv6 ECONNRESET 방지) */
const BACKEND_URL = "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: BACKEND_URL,
        changeOrigin: true,
        secure: false,
        timeout: 3_600_000,
        proxyTimeout: 3_600_000,
        configure: (proxy) => {
          proxy.on("error", (err, _req, res) => {
            console.error(
              `[vite proxy] 백엔드(${BACKEND_URL}) 연결 실패:`,
              err.message
            );
            if (res && !res.headersSent) {
              res.writeHead(502, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  detail: `백엔드(${BACKEND_URL})에 연결할 수 없습니다. npm run dev 로 백엔드를 실행하세요.`,
                })
              );
            }
          });
          proxy.on("proxyReq", (_proxyReq, req) => {
            console.log(`[vite proxy] ${req.method} ${req.url} → ${BACKEND_URL}`);
          });
        },
      },
    },
  },
});
