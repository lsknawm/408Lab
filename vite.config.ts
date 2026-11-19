import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-vue': ['vue', '@vueuse/core'],
          'vendor-element': ['element-plus', '@element-plus/icons-vue'],
          'vendor-echarts': ['echarts', 'vue-echarts'],
          'vendor-graph': ['@vue-flow/core', '@vue-flow/background', '@vue-flow/controls', 'd3-hierarchy'],
          'vendor-katex': ['katex'],
        },
      },
    },
  },
})
