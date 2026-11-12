import type { APIRoute } from "astro";
import { feedFor } from "../lib/feeds.ts";

export const GET: APIRoute = async () =>
  new Response(await feedFor("en"), { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
