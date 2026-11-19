import type { MetadataRoute } from "next";
import { listProviders } from "@/lib/store";
import { CARE_TYPES } from "@/lib/site";
import { bangdanPath, changhuxianPath, cityPath, jiagePath, jigouPath, providerPath, shangmenPath } from "@/lib/paths";

export const dynamic = "force-dynamic";

/** 未认领的档案只有官方字段，不进 sitemap（页面也是 noindex） */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [cityPath(), jigouPath(), shangmenPath(), changhuxianPath(), bangdanPath(), jiagePath(), ...CARE_TYPES.map(jiagePath), jiagePath("shangmen"), "/rules"];
  return [
    ...pages.map((url) => ({ url })),
    ...listProviders()
      .filter((p) => p.claimed)
      .map((p) => ({ url: providerPath(p), lastModified: p.fields.map((f) => f.confirmedAt).sort().at(-1) })),
  ];
}
