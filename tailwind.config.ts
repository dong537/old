import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 养老机构主流程采用参考站的绿白信息门户视觉；状态色仍独立表达来源和风险。
        brand: { DEFAULT: '#2E861F', dark: '#246719', tint: '#F1F8EE', line: '#C8E2C2', ink: '#1E591C' },
        ink: '#202A23', body: '#445148', sub: '#657268', page: '#F4F5F7', line: '#E3E9E1', hair: '#ECF0EA',
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
        card: '0 1px 3px rgba(24, 47, 28, 0.05)',
        lift: '0 5px 16px rgba(24, 47, 28, 0.10)',
      },
      borderRadius: { card: '4px' },
    },
  },
  plugins: [],
} satisfies Config;
