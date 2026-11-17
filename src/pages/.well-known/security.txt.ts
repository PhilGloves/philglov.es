import type { APIRoute } from "astro";
import site from "../../data/site.json" with { type: "json" };
import { securityTxt } from "../../lib/security-txt.ts";

export const GET: APIRoute = () =>
  new Response(securityTxt(site.contactEmail, new Date()), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
