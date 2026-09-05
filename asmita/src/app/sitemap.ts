import type { MetadataRoute } from "next";
import { allPublicPaths } from "@/lib/site-map";

const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://meriasmita.org";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return allPublicPaths.map((path) => ({
    url: new URL(path, base).toString(),
    lastModified,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path.startsWith("/get-help") || path === "/start" ? 0.9 : 0.6,
  }));
}
