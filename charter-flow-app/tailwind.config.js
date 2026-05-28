/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Институциональная светлая палитра в духе финансовых документов
        // премиального уровня (JP Morgan, Goldman Sachs, McKinsey).
        paper: {
          DEFAULT: '#FAFAF6', // основной фон страницы — тёплый кремовый
          50: '#FFFFFF',
          100: '#FBFAF5',
          200: '#F5F3EB',
          300: '#EDEAE0',
        },
        ink: {
          DEFAULT: '#0B0B0B',
          900: '#0B0B0B', // чёрная типографика — авторитет
          800: '#1A1A1A',
          700: '#2B2B2B',
          600: '#5C5C5C', // вторичный текст
          500: '#7A7A7A',
          400: '#9C9C9C', // подписи, мета
          300: '#BDBDBD',
        },
        // Сдержанное золото — институциональный акцент
        gold: {
          DEFAULT: '#9C7C2A',
          400: '#C9A961',
          500: '#A8862C',
          600: '#9C7C2A',
          700: '#7E6420',
          800: '#5C4818',
        },
        // Границы и разделители (тёплый серый)
        rule: {
          DEFAULT: '#E5E2DA',
          light: '#EFECE4',
          strong: '#D4D0C5',
        },
        // Семантические цвета статусов
        status: {
          active: '#9C7C2A',
          processing: '#3D6A8F',
          completed: '#3F7D52',
          warning: '#A4682B',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'Urbanist',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        serif: ['"GT Sectra"', 'Georgia', '"Times New Roman"', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        // Тонкие тени для глубины — институциональная сдержанность
        soft: '0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.04)',
        card: '0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(11, 11, 11, 0.06)',
        'card-hover':
          '0 2px 6px rgba(0, 0, 0, 0.05), 0 12px 32px rgba(11, 11, 11, 0.10)',
        gold: '0 0 0 1px rgba(156, 124, 42, 0.18)',
      },
      letterSpacing: {
        institutional: '0.22em',
      },
    },
  },
  plugins: [],
};
