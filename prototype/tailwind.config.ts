import type { Config } from "tailwindcss";

// 主题色：沉稳的青色，和可信度等级的绿、蓝、灰、黄，以及风险提示的红分开
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0F6A6E",
          dark: "#0B5357",
          tint: "#EAF5F5",
          line: "#C9E3E3",
          ink: "#0B4245",
        },
        ink: "#1F2329",
        body: "#3D434B",
        sub: "#5C626B",
        page: "#F6F7F9",
        line: "#E8EAED",
        hair: "#F0F1F3",
        // 可信度等级（沿用知底）
        gradeA: { DEFAULT: "#1E6B45", bg: "#E7F5EC" },
        gradeB: { DEFAULT: "#2456A6", bg: "#EAF1FC" },
        gradeC: { DEFAULT: "#4A5059", bg: "#EEF0F2" },
        gradeD: { DEFAULT: "#7A4A00", bg: "#FFF2D9", soft: "#FFF8EA", line: "#E9C27A" },
        // 风险提示：只放官方负面记录和不合规收费，单独一种红
        risk: { DEFAULT: "#A1260D", bg: "#FDECEA", line: "#F2C1B8" },
        official: { DEFAULT: "#5B3F99", bg: "#F1ECFA" },
        admin: { nav: "#262A30", text: "#E6E8EB", muted: "#B9BEC6" },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", '"PingFang SC"', '"Microsoft YaHei"', '"Noto Sans SC"', "sans-serif"],
      },
      maxWidth: { site: "1200px" },
    },
  },
  plugins: [],
};

export default config;
