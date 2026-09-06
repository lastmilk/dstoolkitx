import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const srcDir = fileURLToPath(new URL('./src', import.meta.url))


// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // isomorphic-git 依赖 Node 的 Buffer/global（浏览器端 push/fetch 解包需要）
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  resolve: {
    alias: {
      '@': srcDir,
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Git 智能 HTTP（isomorphic-git 推送/拉取）
      '/git': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
