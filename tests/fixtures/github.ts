import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fixtureContent } from "./content.ts";

interface Recorded {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

interface Pull {
  number?: number;
  html_url: string;
  title: string;
  created_at: string;
  user: { login: string };
  head?: { ref: string };
}

export interface FakeGitHub {
  files: Record<string, string>;
  pulls: Pull[];
  calls: Recorded[];
  autoMergeRefused: boolean;
  writeConflict: boolean;
}

export const fakeGitHub = (): FakeGitHub => ({
  files: {},
  pulls: [],
  calls: [],
  autoMergeRefused: false,
  writeConflict: false,
});

export async function githubFetch(state: FakeGitHub, request: Request, history?: Recorded[]): Promise<Response> {
  const url = new URL(request.url);
  const { pathname, search } = url;
  const { method } = request;
  const json = (status: number, body: unknown) => Response.json(body, { status });
  const body: Recorded["body"] = method === "GET" ? null : await request.json().catch(() => null);
  const call = { method, path: pathname + search, body };
  state.calls.push(call);
  history?.push(call);

  if (/^\/app\/installations\/\d+\/access_tokens$/.test(pathname))
    return json(201, { token: "ghs_test", expires_at: new Date(Date.now() + 3600_000).toISOString() });

  const path = /^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/.exec(pathname)?.[1];
  if (path && method === "GET") {
    const ref = url.searchParams.get("ref") ?? "main";
    try {
      const text =
        ref === "main"
          ? (state.files[path] ?? readFileSync(new URL(path.replace(/^src\/content\//, ""), fixtureContent), "utf8"))
          : state.files[`${path}@${ref}`];
      if (text !== undefined)
        return json(200, {
          sha: createHash("sha1").update(text).digest("hex"),
          encoding: "base64",
          content: Buffer.from(text).toString("base64"),
        });
    } catch {
      return json(404, { message: "Not Found" });
    }
  }
  if (path && method === "PUT") {
    if (state.writeConflict) return json(409, { message: "does not match" });
    if (typeof body?.["branch"] === "string")
      state.files[`${path}@${body["branch"]}`] = Buffer.from(String(body["content"] ?? ""), "base64").toString();
    return json(201, { content: {} });
  }
  if (pathname === "/graphql")
    return json(
      200,
      state.autoMergeRefused
        ? { errors: [{ message: "Auto merge is not allowed for this repository" }] }
        : { data: { enablePullRequestAutoMerge: { clientMutationId: null } } },
    );
  if (pathname.endsWith("/git/ref/heads/main")) return json(200, { object: { sha: "main-sha" } });
  if (pathname.endsWith("/git/refs")) return json(201, {});
  if (/\/git\/refs\/heads\//.test(pathname) && method === "DELETE") return new Response(null, { status: 204 });
  if (pathname.endsWith("/pulls")) {
    if (method === "GET") return json(200, state.pulls);
    const number = 99 + state.pulls.filter((pull) => pull.number !== undefined).length;
    const html_url = `https://github.com/test/repo/pull/${number}`;
    state.pulls.push({
      number,
      html_url,
      title: String(body?.["title"] ?? ""),
      created_at: new Date().toISOString(),
      user: { login: "philglov-publisher[bot]" },
      head: { ref: String(body?.["head"] ?? "") },
    });
    return json(201, { html_url, number, node_id: `PR_node${number}` });
  }
  return json(404, { message: "Not Found" });
}
