/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      // Премиум палитра банковского терминала
      colors: {
        // Чёрные тона — фон «бездны»
        abyss: {
          DEFAULT: '#050505',
          900: '#070707',
          800: '#0c0c0c',
          700: '#121212',
          600: '#181818',
          500: '#202020',
        },
        // Золотой акцент — институциональный премиум
        gold: {
          DEFAULT: '#D4AF37',
          400: '#E5C76B',
          500: '#D4AF37',
          600: '#B8932E',
          700: '#8C6F22',
        },
        // Семантические цвета статусов
        status: {
          active: '#D4AF37',
          processing: '#7DB9DE',
          completed: '#4CAF7D',
          warning: '#E5A04C',
        },
      },
      fontFamily: {
        // Urbanist — основной (заголовки и крупный текст)
        // Inter — fallback и таблицы / технические данные
        sans: [
          'Urbanist',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        gold: '0 0 24px rgba(212, 175, 55, 0.18)',
        'gold-strong': '0 0 36px rgba(212, 175, 55, 0.35)',
        card: '0 8px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #E5C76B 0%, #D4AF37 50%, #8C6F22 100%)',
        'card-gradient':
          'linear-gradient(180deg, rgba(18,18,18,0.95) 0%, rgba(8,8,8,0.95) 100%)',
      },
      animation: {
        'pulse-gold': 'pulse-gold 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2.4s linear infinite',
      },
      keyframes: {
        'pulse-gold': {
          '0%, 100%': { opacity: '1', boxShadow: '0 0 0 0 rgba(212,175,55,0.6)' },
          '50%': { opacity: '0.8', boxShadow: '0 0 0 8px rgba(212,175,55,0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
