import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./app/**/*.tsx', './components/**/*.tsx'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#effaf5',
          500: '#12a26b',
          600: '#0b8457',
          700: '#086a46',
        },
        ink: '#14211b',
      },
      borderRadius: { card: '14px' },
      fontFamily: { sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'] },
    },
  },
} satisfies Config;
