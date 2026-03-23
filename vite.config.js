import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/课程列表': 'http://localhost:8000',
      '/上传课程数据': 'http://localhost:8000',
      '/设置选课人数': 'http://localhost:8000',
      '/随机生成初始人数': 'http://localhost:8000',
      '/学生选课': 'http://localhost:8000',
    },
  },
})
