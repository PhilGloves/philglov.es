import type { APIRoute } from "astro";
import { tdmrepJson } from "../../lib/robots.ts";

export const GET: APIRoute = () =>
  new Response(tdmrepJson(), { headers: { "Content-Type": "application/json; charset=utf-8" } });
