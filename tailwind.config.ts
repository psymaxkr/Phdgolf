import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: { DEFAULT: '#FFFFFF', deep: '#EEF3F9', light: '#F5F8FC', line: '#D3DEEA' },
        gold: { DEFAULT: '#0B3D91', light: '#2F6FD6', dark: '#072B66' },
        ivory: { DEFAULT: '#0B1F3A', dim: '#5B6B80' },
        turf: { DEFAULT: '#15803D', light: '#22A355', pale: '#E6F4EA' },
        silver: '#8A96A3',
        bronze: '#B0683A',
      },
      fontFamily: { sans: ['Pretendard Variable', 'Pretendard', 'Noto Sans KR', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
