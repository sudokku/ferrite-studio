import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7878',
        changeOrigin: false,
        // Allow up to 2 minutes for large multipart uploads (e.g. 47 MB IDX files)
        proxyTimeout: 120_000,
        timeout: 120_000,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            // EPIPE means the upstream closed the connection before we finished
            // writing the request body. This is not fatal — the Rust service
            // already processed the request and closed its end. Suppress the
            // noisy Vite log and send a 502 only if the response hasn't been
            // sent yet (in practice the browser already received the response).
            if ((err as NodeJS.ErrnoException).code === 'EPIPE') {
              const serverRes = res as import('http').ServerResponse
              if (!serverRes.headersSent) {
                serverRes.writeHead(502)
                serverRes.end('upstream connection closed')
              }
              return
            }
            console.error('[vite proxy]', err.message)
          })
          // Disable socket timeout on the outgoing proxy socket so that slow
          // uploads to the Rust service are not cut short by Node's default
          // idle-socket timeout.
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.socket?.setTimeout(0)
          })
        },
      },
    },
  },
})
