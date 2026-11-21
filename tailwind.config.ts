import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#D84222', dark: '#AE2A19', tint: '#FFF0DD', line: '#EBC7A4', ink: '#8F321D' },
        ink: '#302C29', body: '#574B43', sub: '#76685F', page: '#FCF8F1', line: '#E6D6C5', hair: '#F0E4D7',
        gradeA: { DEFAULT: '#1E6B45', bg: '#E7F5EC' },
        gradeB: { DEFAULT: '#2456A6', bg: '#EAF1FC' },
        gradeC: { DEFAULT: '#4A5059', bg: '#EEF0F2' },
        gradeD: { DEFAULT: '#7A4A00', bg: '#FFF2D9', soft: '#FFF8EA', line: '#E9C27A' },
        risk: { DEFAULT: '#A1260D', bg: '#FDECEA', line: '#F2C1B8' },
        official: { DEFAULT: '#5B3F99', bg: '#F1ECFA' },
        caution: { DEFAULT: '#88501A', bg: '#FFF8EB', line: '#E8C798' },
      },
      fontFamily: { sans: ['-apple-system', 'BlinkMacSystemFont', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', 'sans-serif'] },
      maxWidth: { site: '1280px' },
    },
  },
  plugins: [],
} satisfies Config;
