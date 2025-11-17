import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
        generator: resolve(__dirname, 'generator/index.html'),
        generatorPage2: resolve(__dirname, 'generator/page2/index.html'),
        generatorPage3: resolve(__dirname, 'generator/page3/index.html'),
        form1: resolve(__dirname, 'form1/index.html'),
        form2: resolve(__dirname, 'form2/index.html'),
        form3: resolve(__dirname, 'form3/index.html'),
        user: resolve(__dirname, 'user/index.html'),
      },
    },
  },
})
