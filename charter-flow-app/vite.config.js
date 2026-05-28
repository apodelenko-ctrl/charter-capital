import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Конфигурация Vite.
//
// Источник проекта живёт в /charter-flow-app/, а собранные статические
// файлы кладутся в /charter-flow/ репозитория (рядом со статикой
// ccapital.pro), откуда их подхватывает GitHub Pages при деплое.
//
// base: '/charter-flow/' соответствует публичному URL на ccapital.pro.
// Для standalone-хостинга можно установить base: '/'.
export default defineConfig({
  plugins: [react()],
  base: '/charter-flow/',
  build: {
    // Кладём сборку на уровень выше — в репо-рут /charter-flow/
    outDir: '../charter-flow',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: true,
  },
});
