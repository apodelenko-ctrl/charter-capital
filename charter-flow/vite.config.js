import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Конфигурация Vite.
// base: '/charter-flow/' позволяет деплоить собранный dist в подпапку
// рядом со статическим сайтом charter-capital. Для локальной разработки
// и независимого деплоя можно временно установить base: '/'.
export default defineConfig({
  plugins: [react()],
  base: '/charter-flow/',
  server: {
    port: 5173,
    host: true,
  },
});
