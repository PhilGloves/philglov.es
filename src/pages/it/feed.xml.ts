import type { APIRoute } from "astro";
import { feedFor } from "../../lib/feeds.ts";

export const GET: APIRoute = async () =>
  new Response(await feedFor("it"), { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
