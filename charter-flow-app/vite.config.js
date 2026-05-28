import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// Конфигурация Vite.
//
// Источник проекта живёт в /charter-flow-app/, а собранные статические
// файлы кладутся в /charter-flow/ репозитория (рядом со статикой
// ccapital.pro), откуда их подхватывает GitHub Pages при деплое.
//
// Двухстраничный билд (multi-page application):
//   - index.html  → /charter-flow/           (презентация для источника МРГ)
//   - client.html → /charter-flow/client.html (презентация для заказчика)
export default defineConfig({
  plugins: [react()],
  base: '/charter-flow/',
  build: {
    outDir: '../charter-flow',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        client: resolve(__dirname, 'client.html'),
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
