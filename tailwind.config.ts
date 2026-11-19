import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#145F60', dark: '#0E484B', tint: '#EAF4F1', line: '#C8DED9', ink: '#12474A' },
        ink: '#1C3033', body: '#3B4B4E', sub: '#5A6B6E', page: '#F5F8F7', line: '#DCE6E3', hair: '#E9EFED',
        gradeA: { DEFAULT: '#1E6B45', bg: '#E7F5EC' },
        gradeB: { DEFAULT: '#2456A6', bg: '#EAF1FC' },
        gradeC: { DEFAULT: '#4A5059', bg: '#EEF0F2' },
        gradeD: { DEFAULT: '#7A4A00', bg: '#FFF2D9', soft: '#FFF8EA', line: '#E9C27A' },
        risk: { DEFAULT: '#A1260D', bg: '#FDECEA', line: '#F2C1B8' },
        official: { DEFAULT: '#5B3F99', bg: '#F1ECFA' },
        caution: { DEFAULT: '#7A4A00', bg: '#FFF8EA', line: '#E9C27A' },
      },
      fontFamily: { sans: ['-apple-system', 'BlinkMacSystemFont', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', 'sans-serif'] },
      maxWidth: { site: '1180px' },
    },
  },
  plugins: [],
} satisfies Config;
