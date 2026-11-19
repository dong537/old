import type { MetadataRoute } from "next";

/** 本机演示原型不允许抓取或收录。 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
