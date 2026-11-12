import type { APIRoute } from "astro";
import { shareManifest } from "../lib/feeds.ts";

/**
 * Build-time only: lists every share image to draw (file name and title).
 * scripts/share-images.ts reads dist/share-manifest.json, draws the PNGs into
 * dist/_assets/share/ and deletes the manifest, so it is never served.
 */
export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await shareManifest()), { headers: { "Content-Type": "application/json" } });
