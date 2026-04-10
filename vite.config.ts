import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/feishu-bitable-pdf-export/',  // GitHub Pages 路径
})
