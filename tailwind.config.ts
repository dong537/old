import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 主操作色：深青绿（依据设计契约，暖橙只用于核对提示）
        brand: { DEFAULT: '#0F6A6E', dark: '#0B5357', tint: '#E8F3F2', line: '#BFDBD8', ink: '#0A4A4D' },
        // 中性色：冷灰底 + 冷调文字
        ink: '#1B2226', body: '#46525C', sub: '#64727E', page: '#F5F7F8', line: '#E2E7EA', hair: '#EDF1F3',
        gradeA: { DEFAULT: '#1B6E4E', bg: '#E6F4EC' },
        gradeB: { DEFAULT: '#24589E', bg: '#E9F0FA' },
        gradeC: { DEFAULT: '#4A5560', bg: '#EDF0F2' },
        gradeD: { DEFAULT: '#8A5A00', bg: '#FFF4DC', soft: '#FFF9EE', line: '#E8C583' },
        risk: { DEFAULT: '#A1260D', bg: '#FCECEA', line: '#F1C2B9' },
        official: { DEFAULT: '#54479B', bg: '#EFECFA' },
        caution: { DEFAULT: '#8A5410', bg: '#FFF8EA', line: '#E9C794' },
      },
      fontFamily: { sans: ['-apple-system', 'BlinkMacSystemFont', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', 'sans-serif'] },
      maxWidth: { site: '1180px' },
      boxShadow: {
        card: '0 1px 2px rgba(17, 32, 40, 0.04), 0 1px 3px rgba(17, 32, 40, 0.05)',
        lift: '0 4px 14px rgba(17, 32, 40, 0.08)',
      },
      borderRadius: { card: '10px' },
    },
  },
  plugins: [],
} satisfies Config;
