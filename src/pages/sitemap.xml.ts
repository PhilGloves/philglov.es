import type { APIRoute } from "astro";
import { sitemapFor } from "../lib/feeds.ts";

export const GET: APIRoute = async () =>
  new Response(await sitemapFor(), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
