import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: colors.slate,
        brand: {
          50: '#eef6ff',
          100: '#dfeeff',
          500: '#2457f5',
          600: '#1d46cf',
          900: '#0f172a'
        },
        ink: '#111827',
        success: '#16a34a',
        warning: '#f59e0b',
        danger: '#dc2626'
      },
      boxShadow: {
        soft: '0 12px 30px rgba(15, 23, 42, 0.08)'
      }
    }
  },
  plugins: []
};
