/**
 * Sends the comment and report forms in the background (owner decision 2026-11-13). Without JavaScript the forms
 * work exactly as before: a plain POST, then the message in the page (decisions 0016, 0017).
 *
 * The Worker answers a request that accepts JSON with ready-made text (FormReply in worker/src/page.ts); this
 * script only places it, as text, never as HTML. Same origin only: the action is a relative /api/ path, the fetch
 * mode is "same-origin" and the CSP's connect-src is 'self'. Anything unexpected (a network error, an answer that is
 * not JSON, an expired Access session redirecting elsewhere) falls back to the normal post.
 * Counted in the 1.5 KB public JavaScript budget with the theme script (tests/unit/build-output.test.ts).
 */
type Reply = { ok: boolean; s: string; t: string; m: string; e: [string, string][] };

// The ids the Worker names always exist: they are the form contract (decision 0016), checked by tests/worker.
const doc = document;
const byId = (id: string) => doc.getElementById(id) as HTMLElement;
const make = (tag: string) => doc.createElement(tag);

addEventListener("submit", async (event) => {
  const form = event.target as HTMLFormElement;
  // A relative /api/ action is always this origin.
  if (!form.getAttribute("action")?.startsWith("/api/")) return;
  event.preventDefault();
  let reply: Reply;
  try {
    reply = await (
      await fetch(form.action, {
        method: "POST",
        mode: "same-origin",
        headers: { Accept: "application/json" },
        body: new URLSearchParams(new FormData(form) as unknown as Record<string, string>),
      })
    ).json();
  } catch {
    return form.submit();
  }
  for (const [id, message] of reply.e) {
    byId(id).setAttribute("aria-invalid", `${!!message}`);
    byId(`${id}-err`).textContent = message;
  }
  // Success: an empty title and the thank-you. Failure: the title in bold, then what to fix.
  // The status slot has tabindex="-1" in the page, so focus can move there and screen readers announce it.
  const box = make("div");
  const title = make("strong");
  box.className = reply.ok ? "notice" : "alert";
  box.setAttribute("role", reply.ok ? "status" : "alert");
  title.textContent = reply.t;
  box.append(title, reply.m);
  if (reply.ok) form.reset();
  const status = byId(reply.s);
  status.replaceChildren(box);
  status.focus();
});
