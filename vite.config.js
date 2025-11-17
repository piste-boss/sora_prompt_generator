import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
        generator: resolve(__dirname, 'generator/index.html'),
        form1: resolve(__dirname, 'form1/index.html'),
        user: resolve(__dirname, 'user/index.html'),
      },
    },
  },
})
