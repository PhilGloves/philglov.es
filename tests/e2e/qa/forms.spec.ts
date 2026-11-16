/**
 * QA suite 6: the comment and report forms against the real Worker (pnpm preview), JavaScript on and off.
 * Each refusal must show the right visible message in the status slot and keep every typed character:
 * empty name / comment, bad email, too long, 3 links, filled honeypot, sent under 3 s, an expired or forged token,
 * the sixth submission in 10 minutes. Both languages. Same for the report form.
 * XSS payloads: after approval (admin test server with its own Access) they render as text and nothing runs.
 * Console lines: only the browser's own "Failed to load resource" for the 422/429 of a plain post is expected
 * (owner ruling O4); anything else fails.
 */
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { serveAdmin } from "../admin-worker.ts";

type Lang = "en" | "it";
const ui = (l: Lang) =>
  JSON.parse(readFileSync(new URL(`../../../src/i18n/${l}.json`, import.meta.url), "utf8")) as Record<string, string>;
const devVars = readFileSync(new URL("../../../.dev.vars", import.meta.url), "utf8");
const KEY = /^FORM_HMAC_KEY=(.*)$/m.exec(devVars)?.[1] ?? "";

/** A form token for any moment, signed with the local key: "v1.<ms base36>.<HMAC of form:<ms base36>>". */
const tokenAt = (ms: number) => {
  const ts = ms.toString(36);
  return `v1.${ts}.${createHmac("sha256", KEY).update(`form:${ts}`).digest("base64url")}`;
};

const EXPECTED_4XX = /^error: Failed to load resource: the server responded with a status of (422|429)/;
let noise: string[] = [];
let n = 0;
let currentIp = "";

test.beforeEach(async ({ page }) => {
  noise = [];
  page.on("console", (msg) => {
    const line = `${msg.type()}: ${msg.text()}`;
    if ((msg.type() === "error" || msg.type() === "warning") && !EXPECTED_4XX.test(line)) noise.push(line);
  });
  page.on("pageerror", (e) => noise.push(`pageerror: ${e.message}`));
  // Every test is its own visitor, so the 5-per-10-minutes limit never carries over.
  n += 1;
  currentIp = `198.19.${Math.floor(Math.random() * 250) + 1}.${(n % 250) + 1}`;
  await page.setExtraHTTPHeaders({ "CF-Connecting-IP": currentIp });
  await page.emulateMedia({ reducedMotion: "no-preference" });
});
test.afterEach(() => expect(noise).toEqual([]));

const human = (page: Page) => page.waitForTimeout(3_300);

interface Form {
  open: (page: Page, lang: Lang) => Promise<void>;
  fill: (page: Page, values: Record<string, string>) => Promise<void>;
  submit: (page: Page) => Promise<void>;
  status: string;
  field: Record<string, string>;
  notSent: string;
}

const comment: Form = {
  open: async (page, lang) => {
    await page.goto(lang === "en" ? "/lisbona" : "/it/lisbona");
    await page.locator("#comment-form").evaluate(unguard);
  },
  fill: async (page, v) => {
    for (const [k, value] of Object.entries(v)) await page.locator(`#comment-form [name="${k}"]`).fill(value);
  },
  submit: (page) => page.locator("#comment-form button[type=submit]").click(),
  status: "#comment-status",
  field: { name: "#c-name", email: "#c-email", comment: "#c-comment" },
  notSent: "w_notSentComment",
};
const report: Form = {
  open: async (page, lang) => {
    await page.goto(lang === "en" ? "/about" : "/it/about");
    await page.locator("footer summary").click();
    await page.locator('footer form[action^="/api/report"]').evaluate(unguard);
  },
  fill: async (page, v) => {
    for (const [k, value] of Object.entries(v))
      await page.locator(`footer form[action^="/api/report"] [name="${k}"]`).fill(value);
  },
  submit: (page) => page.locator('footer form[action^="/api/report"] button[type=submit]').click(),
  status: "#report-status",
  field: {
    message: 'footer form[action^="/api/report"] [name="message"]',
    email: 'footer form[action^="/api/report"] [name="email"]',
  },
  notSent: "w_notSentReport",
};

/** What a script or a hostile client does: switch off the browser's own checks (required, type=email, maxlength). */
const unguard = (form: HTMLElement) => {
  (form as HTMLFormElement).noValidate = true;
  form.querySelectorAll("[maxlength]").forEach((el) => el.removeAttribute("maxlength"));
};

const GOOD_COMMENT = { name: "Marta", email: "marta@example.com", comment: "The bit about hills being a negotiation." };
const GOOD_REPORT = { message: "A typo in the second paragraph.", email: "" };
const LINKS3 = "see https://a.example/1 and https://b.example/2 and https://c.example/3";

interface Case {
  name: string;
  values: (form: Form) => Record<string, string>;
  /** i18n key of the message that must be shown. */
  message: string;
  /** Wait the 3 s a person takes (all but the "too fast" case). */
  pause?: boolean;
  /** Before sending: change the page's hidden fields. */
  tamper?: (page: Page, form: Form) => Promise<unknown>;
  /** Fields whose text must still be there afterwards. */
  keep: string[];
}

const setHidden = (form: Form, name: string, value: string) => (page: Page) =>
  page
    .locator(
      form === comment ? `#comment-form [name="${name}"]` : `footer form[action^="/api/report"] [name="${name}"]`,
    )
    .evaluate((el, v) => ((el as HTMLInputElement).value = v), value);

const commentCases: Case[] = [
  {
    name: "empty name",
    values: () => ({ ...GOOD_COMMENT, name: "" }),
    message: "w_err_name_required",
    keep: ["comment", "email"],
  },
  {
    name: "empty email",
    values: () => ({ ...GOOD_COMMENT, email: "" }),
    message: "w_err_email_required",
    keep: ["name", "comment"],
  },
  {
    name: "bad email",
    values: () => ({ ...GOOD_COMMENT, email: "not-an-email" }),
    message: "w_err_email_format",
    keep: ["name", "email", "comment"],
  },
  {
    name: "empty comment",
    values: () => ({ ...GOOD_COMMENT, comment: "" }),
    message: "w_err_comment_required",
    keep: ["name", "email"],
  },
  {
    name: "name too long (81)",
    values: () => ({ ...GOOD_COMMENT, name: "N".repeat(81) }),
    message: "w_err_name_long",
    keep: ["name", "comment"],
  },
  {
    name: "comment too long (5,001)",
    values: () => ({ ...GOOD_COMMENT, comment: "word ".repeat(1000) + "x" }),
    message: "w_err_comment_long",
    keep: ["name", "email"],
  },
  {
    name: "3 links",
    values: () => ({ ...GOOD_COMMENT, comment: LINKS3 }),
    message: "w_err_comment_links",
    keep: ["name", "email", "comment"],
  },
  {
    name: "honeypot filled",
    values: () => GOOD_COMMENT,
    message: "w_err_honeypot",
    tamper: (p, f) => setHidden(f, "website", "http://spam.example")(p),
    keep: ["name", "email", "comment"],
  },
  {
    name: "sent under 3 s",
    values: () => GOOD_COMMENT,
    message: "w_err_fast",
    pause: false,
    // A token made this instant, so "under 3 s" does not depend on how fast this machine runs the test.
    tamper: (p, f) => setHidden(f, "token", tokenAt(Date.now()))(p),
    keep: ["name", "email", "comment"],
  },
  {
    name: "token 25 hours old",
    values: () => GOOD_COMMENT,
    message: "w_err_expired",
    tamper: (p, f) => setHidden(f, "token", tokenAt(Date.now() - 25 * 3600_000))(p),
    keep: ["name", "email", "comment"],
  },
  {
    name: "forged token",
    values: () => GOOD_COMMENT,
    message: "w_err_expired",
    tamper: (p, f) => setHidden(f, "token", "v1.abc.forged")(p),
    keep: ["name", "email", "comment"],
  },
];
const reportCases: Case[] = [
  {
    name: "empty message",
    values: () => ({ ...GOOD_REPORT, message: "" }),
    message: "w_err_message_required",
    keep: [],
  },
  {
    name: "bad email",
    values: () => ({ ...GOOD_REPORT, email: "nope" }),
    message: "w_err_email_format",
    keep: ["message", "email"],
  },
  {
    name: "message too long (3,001)",
    values: () => ({ ...GOOD_REPORT, message: "a".repeat(3001) }),
    message: "w_err_message_long",
    keep: [],
  },
  {
    name: "3 links",
    values: () => ({ ...GOOD_REPORT, message: LINKS3 }),
    message: "w_err_message_links",
    keep: ["message"],
  },
  {
    name: "honeypot filled",
    values: () => GOOD_REPORT,
    message: "w_err_honeypot",
    tamper: (p, f) => setHidden(f, "website", "x")(p),
    keep: ["message"],
  },
  {
    name: "sent under 3 s",
    values: () => GOOD_REPORT,
    message: "w_err_fast",
    pause: false,
    tamper: (p, f) => setHidden(f, "token", tokenAt(Date.now()))(p),
    keep: ["message"],
  },
  {
    name: "token 25 hours old",
    values: () => GOOD_REPORT,
    message: "w_err_expired",
    tamper: (p, f) => setHidden(f, "token", tokenAt(Date.now() - 25 * 3600_000))(p),
    keep: ["message"],
  },
];

async function expectRefused(
  page: Page,
  form: Form,
  lang: Lang,
  c: Case,
  typed: Record<string, string>,
  javaScriptEnabled: boolean,
) {
  const t = ui(lang);
  if (!javaScriptEnabled) await page.waitForURL(/\/api\/(comment|report)/);
  const status = page.locator(form.status);
  const alert = status.locator('.alert[role="alert"]');
  await expect(alert, "an alert in the status slot").toBeVisible();
  await expect(alert).toContainText(t[form.notSent] ?? form.notSent);
  await expect(alert, `message "${c.message}"`).toContainText(t[c.message] ?? c.message);
  await expect(status).toBeInViewport();
  for (const key of c.keep) {
    const selector = form.field[key];
    if (selector) await expect(page.locator(selector), `"${key}" keeps what was typed`).toHaveValue(typed[key] ?? "");
  }
  if (javaScriptEnabled) await expect(status).toBeFocused();
}

for (const lang of ["en", "it"] as const) {
  for (const [label, form, cases] of [
    ["comment", comment, commentCases],
    ["report", report, reportCases],
  ] as const) {
    for (const c of cases) {
      test(`${label} form (${lang}): ${c.name} is refused with its message, the text kept`, async ({
        page,
        javaScriptEnabled,
      }) => {
        test.setTimeout(60_000);
        await form.open(page, lang);
        if (c.pause !== false) await human(page);
        const typed = c.values(form);
        await form.fill(page, typed);
        if (c.tamper) await c.tamper(page, form);
        await form.submit(page);
        await expectRefused(page, form, lang, c, typed, javaScriptEnabled);
      });
    }
  }
}

// SO-02: the message after an expired token says "send it again"; doing so must work, the text kept. Without
// JavaScript the page that answers has a fresh token; with it, the answer carries one and the script puts it in.
for (const [label, form, good, sent] of [
  ["comment", comment, GOOD_COMMENT, "w_sentComment"],
  ["report", report, GOOD_REPORT, "w_sentReport"],
] as const) {
  test(`${label} form: after an expired token, pressing Send again sends it, the text kept until then`, async ({
    page,
    javaScriptEnabled,
  }) => {
    test.setTimeout(60_000);
    await form.open(page, "en");
    await human(page);
    await form.fill(page, good);
    await setHidden(form, "token", tokenAt(Date.now() - 25 * 3600_000))(page);
    await form.submit(page);
    const keep = Object.keys(good).filter((k) => good[k as keyof typeof good] !== "");
    const expired = { name: "expired", values: () => good, message: "w_err_expired", keep };
    await expectRefused(page, form, "en", expired, good, javaScriptEnabled);
    await human(page);
    await form.submit(page);
    if (!javaScriptEnabled) await page.waitForURL(new RegExp(`\\?sent=${label}#${label}-status$`));
    await expect(page.locator(`${form.status} .notice[role="status"]`)).toHaveText(ui("en")[sent] ?? "");
  });
}

for (const [label, form, good, lang] of [
  ["comment", comment, GOOD_COMMENT, "en"],
  ["comment", comment, GOOD_COMMENT, "it"],
  ["report", report, GOOD_REPORT, "en"],
] as const) {
  test(`${label} form (${lang}): the sixth submission in 10 minutes is refused, the first five were accepted`, async ({
    page,
    javaScriptEnabled,
  }) => {
    test.setTimeout(90_000);
    await form.open(page, lang);
    await human(page);
    const scope = form === comment ? "#comment-form" : 'footer form[action^="/api/report"]';
    const token = await page.locator(`${scope} [name="token"]`).inputValue();
    const url = form === comment ? "/api/comment" : "/api/report";
    const fields =
      form === comment
        ? { ...good, slug: "lisbona", lang, website: "", token }
        : { ...good, url: "/about", lang, website: "", token };
    // Five accepted posts from this visitor's address (the page's own header), then the sixth through the page.
    for (let i = 1; i <= 5; i++) {
      const res = await page.request.post(url, {
        form: fields,
        maxRedirects: 0,
        headers: { "CF-Connecting-IP": currentIp },
      });
      expect(res.status(), `submission ${i}`).toBe(303);
    }
    const typed = form.fill === comment.fill ? GOOD_COMMENT : GOOD_REPORT;
    await form.fill(page, typed);
    await form.submit(page);
    await expectRefused(
      page,
      form,
      lang,
      {
        name: "rate",
        values: () => typed,
        message: "w_err_rate",
        keep: Object.keys(typed).filter((k) => k !== "email" || form === comment),
      },
      typed,
      javaScriptEnabled,
    );
  });
}

test("a good comment is accepted, in both languages: the thank-you shows and the fields are cleared (JS) or the page is back at the slot (no JS)", async ({
  page,
  javaScriptEnabled,
}) => {
  test.setTimeout(60_000);
  for (const lang of ["en", "it"] as const) {
    await comment.open(page, lang);
    await human(page);
    await comment.fill(page, GOOD_COMMENT);
    await comment.submit(page);
    if (!javaScriptEnabled) await page.waitForURL(/\?sent=comment#comment-status$/);
    await expect(page.locator('#comment-status .notice[role="status"]')).toHaveText(ui(lang)["w_sentComment"] ?? "");
    if (javaScriptEnabled) await expect(page.locator("#c-comment")).toHaveValue("");
    await page.waitForTimeout(100);
  }
});

test("the report form, good: accepted in both languages", async ({ page, javaScriptEnabled }) => {
  test.setTimeout(60_000);
  for (const lang of ["en", "it"] as const) {
    await report.open(page, lang);
    await human(page);
    await report.fill(page, GOOD_REPORT);
    await report.submit(page);
    if (!javaScriptEnabled) await page.waitForURL(/\?sent=report#report-status$/);
    await expect(page.locator('#report-status .notice[role="status"]')).toHaveText(ui(lang)["w_sentReport"] ?? "");
  }
});

// Spaces between the pieces, so no word is longer than about 25 characters: this comment is approved on a page that
// other tests measure while it is up (the Worker caches the list for 60 s), and it must not widen it (BUG-5).
// The name limit is 80 characters, nonce included (see the public test): keep the name short, the text carries the rest.
const PAYLOAD_NAME = `<img src=x onerror=" window.__xss=1 ">`;
const PAYLOAD_TEXT = [
  `<script> window.__xss=3 </script>`,
  `<img src=x onerror=" window.__xss=4 ">`,
  `<svg onload="window.__xss=5"> </svg>`,
  `[click] (javascript: window.__xss=6)`,
  `<a href="javascript: window.__xss=7"> link </a>`,
  `</textarea> <iframe src=" https://evil.example "> </iframe>`,
].join("\n");

const d1 = (sql: string) => {
  const wrangler = fileURLToPath(new URL("../../../node_modules/wrangler/bin/wrangler.js", import.meta.url));
  return spawnSync(process.execPath, [wrangler, "d1", "execute", "DB", "--local", "--command", sql], {
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
  });
};

test("XSS payloads on the moderation page are text, and approving them runs nothing", async ({
  page,
  javaScriptEnabled,
}) => {
  test.setTimeout(60_000);
  const admin = await serveAdmin();
  try {
    const dialogs: string[] = [];
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    admin.db
      .prepare(
        "INSERT INTO comments (slug, lang, name, email, body, status, created_at, ip_hash) VALUES ('lisbona', 'en', ?, 'xss@example.com', ?, 'pending', ?, 'h')",
      )
      .run(PAYLOAD_NAME, PAYLOAD_TEXT, Date.now());
    await page.goto(`${admin.origin}/admin`);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    await expect(page.locator("main")).toContainText(PAYLOAD_NAME);
    await expect(page.locator("main")).toContainText("<script> window.__xss=3 </script>");
    expect(await page.locator("main img, main svg, main iframe, main [onerror], main [onload]").count()).toBe(0);
    await page.getByRole("button", { name: "Approve" }).first().click();
    if (javaScriptEnabled) await expect(page.locator(".badge").first()).toHaveText("approved");
    else await page.waitForLoadState("load");
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(dialogs).toEqual([]);
  } finally {
    await admin.close();
  }
});

test("XSS payloads render as plain text on the published page, on both language versions, and nothing runs", async ({
  page,
}) => {
  test.setTimeout(150_000);
  // Both Chromium projects run this test at the same time against one local database: each uses (and deletes) only
  // its own comment, found by this marker in the name.
  const nonce = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  const elsewhere: string[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).hostname !== "127.0.0.1") elsewhere.push(req.url());
  });
  await comment.open(page, "en");
  await human(page);
  await comment.fill(page, { name: `${PAYLOAD_NAME} ${nonce}`, email: "xss@example.com", comment: PAYLOAD_TEXT });
  await comment.submit(page);
  // Accepted, not refused: an error here (for instance a name over 80 characters) must not pass for success.
  await expect(page.locator('#comment-status .notice[role="status"]')).toBeVisible();

  // Approve it as the moderator would (the admin buttons are tested in admin.spec.ts): straight in the local database.
  const done = d1(`UPDATE comments SET status = 'approved' WHERE name LIKE '%${nonce}'`);
  expect(done.status, done.stderr).toBe(0);
  try {
    for (const path of ["/lisbona", "/it/lisbona"]) {
      // The Worker caches the comment list for 60 s per entry: reload until the approved one is in.
      await expect
        .poll(async () => (await page.goto(path), await page.locator('[data-slot="comments"]').innerText()), {
          timeout: 80_000,
          intervals: [2_000],
          message: `${path}: the approved comment appears within a minute`,
        })
        .toContain(nonce);
      const list = page.locator('[data-slot="comments"]');
      await expect(list).toContainText("<script> window.__xss=3 </script>");
      expect(
        await list.locator("script, img, svg, iframe, object, embed").count(),
        `${path}: no element came from the payload`,
      ).toBe(0);
      expect(await list.locator("[onerror], [onload], [onclick]").count()).toBe(0);
      const hrefs = await list.locator("a").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
      for (const h of hrefs) expect(h, "no javascript: link").not.toMatch(/^\s*javascript:/i);
      expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    }
    expect(dialogs).toEqual([]);
    expect(elsewhere).toEqual([]);
  } finally {
    // Leave no payload behind in the local database, pass or fail (only this test's own comment).
    d1(`DELETE FROM comments WHERE name LIKE '%${nonce}'`);
  }
});

test("the browser's own limits are in the markup too: required fields, type=email, maxlength", async ({ page }) => {
  await page.goto("/lisbona");
  const f = page.locator("#comment-form");
  await expect(f.locator("#c-name")).toHaveAttribute("maxlength", "80");
  await expect(f.locator("#c-email")).toHaveAttribute("maxlength", "254");
  await expect(f.locator("#c-email")).toHaveAttribute("type", "email");
  await expect(f.locator("#c-comment")).toHaveAttribute("maxlength", "5000");
  for (const id of ["#c-name", "#c-email", "#c-comment"]) await expect(f.locator(id)).toHaveAttribute("required", "");
  await page.locator("footer summary").click();
  await expect(page.locator('footer form[action^="/api/report"] textarea')).toHaveAttribute("maxlength", "3000");
});
