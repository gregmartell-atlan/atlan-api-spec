/**
 * Generate an OpenAPI 3 spec from Atlan's developer docs (mkdocs-material site).
 *
 * Strategy:
 * - Parse https://developer.atlan.com/endpoints/ to discover the canonical endpoint list
 * - Crawl relevant use-case documentation pages starting from:
 *   - https://developer.atlan.com/endpoints/
 *   - https://developer.atlan.com/snippets/
 *   - https://developer.atlan.com/sdks/raw/
 * - From every crawled page, extract Raw REST API request examples from code blocks whose
 *   filename matches: "<METHOD> /api/..."
 * - Build a minimal OpenAPI 3.0.3 document with best-effort schemas inferred from examples
 *
 * Output:
 * - src/generated/atlan-openapi.json
 *
 * Environment overrides:
 * - ATLAN_DOC_MAX_PAGES=400
 * - ATLAN_DOC_ALLOW_PREFIXES=/snippets/,/endpoints/,/sdks/raw/
 *
 * Notes:
 * - Many examples contain comments like "// (1)" which are stripped before JSON parsing.
 * - Some endpoints include query strings; we split these into OpenAPI query parameters.
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = "https://developer.atlan.com";
const ENDPOINTS_INDEX_URL = `${ROOT}/endpoints/`;
const SNIPPETS_INDEX_URL = `${ROOT}/snippets/`;
const RAW_SDK_URL = `${ROOT}/sdks/raw/`;

const MAX_PAGES = Number.parseInt(process.env.ATLAN_DOC_MAX_PAGES ?? "400", 10);
const ALLOW_PREFIXES = (process.env.ATLAN_DOC_ALLOW_PREFIXES ??
  "/snippets/,/endpoints/,/sdks/raw/")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function uniq(arr) {
  return [...new Set(arr)];
}

function decodeHtmlEntities(input) {
  // Minimal entity decoding sufficient for mkdocs highlight output.
  return input
    .replaceAll("&quot;", '"')
    .replaceAll("&#34;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

function stripHtmlTags(input) {
  return input.replace(/<[^>]*>/g, "");
}

function extractPageTitle(html) {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(stripHtmlTags(titleMatch[1])).trim() : undefined;

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = h1Match ? decodeHtmlEntities(stripHtmlTags(h1Match[1])).trim() : undefined;

  // Prefer H1 for user-facing titles.
  return h1 || title || "Untitled";
}

function isCrawlableDocUrl(u) {
  if (u.origin !== new URL(ROOT).origin) return false;
  if (!u.pathname.endsWith("/")) return false;
  if (!ALLOW_PREFIXES.some((p) => u.pathname.startsWith(p))) return false;
  return true;
}

function extractInternalLinks(html, baseUrl) {
  const base = new URL(baseUrl);
  const links = [];
  const re = /href=\"([^\"]+)\"/g;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (!href) continue;
    if (href.startsWith("#")) continue;
    if (href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    // Skip obvious assets.
    if (href.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|webp)(\?|#|$)/i)) continue;
    try {
      const u = new URL(href, base);
      // Strip hash / query for stable crawling.
      u.hash = "";
      u.search = "";
      if (isCrawlableDocUrl(u)) links.push(u.toString());
    } catch {
      // ignore
    }
  }
  return uniq(links);
}

function cleanJsonLikeText(text) {
  // Remove line comments.
  const noLineComments = text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

  // Remove inline // comments (best-effort).
  const noInlineComments = noLineComments.replace(/\s\/\/.*$/gm, "");

  // Remove trailing commas before closing braces/brackets.
  return noInlineComments.replace(/,\s*([}\]])/g, "$1").trim();
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function inferSchemaFromExample(example) {
  if (example === null) return { type: "null" };
  if (Array.isArray(example)) {
    const itemSchemas = example.map(inferSchemaFromExample);
    // Best-effort: if array has mixed types, fall back to free-form.
    const first = itemSchemas[0];
    const homogeneous =
      itemSchemas.length === 0 ||
      itemSchemas.every((s) => JSON.stringify(s) === JSON.stringify(first));
    return {
      type: "array",
      items: homogeneous ? first ?? {} : {},
    };
  }
  switch (typeof example) {
    case "string":
      return { type: "string" };
    case "number":
      return Number.isInteger(example) ? { type: "integer" } : { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "object": {
      const props = {};
      for (const [k, v] of Object.entries(example)) {
        props[k] = inferSchemaFromExample(v);
      }
      return { type: "object", properties: props, additionalProperties: true };
    }
    default:
      return {};
  }
}

function parseEndpointLabel(label) {
  // Example: "POST /api/meta/entity/auditSearch"
  // Some pages may include extra whitespace.
  const m = label.trim().match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/\S+)$/i);
  if (!m) return null;
  return { method: m[1].toUpperCase(), rawPath: m[2] };
}

function splitPathAndQuery(rawPath) {
  const [pathname, queryString] = rawPath.split("?");
  const queryParams = [];

  if (queryString) {
    for (const pair of queryString.split("&")) {
      const [name, value] = pair.split("=");
      if (!name) continue;
      // developer.atlan.com sometimes shows placeholders like {qualifiedName}
      // so treat these as parameters (value is informational).
      queryParams.push({
        name: decodeURIComponent(name),
        example: value ? decodeURIComponent(value) : undefined,
      });
    }
  }

  return { pathname, queryParams };
}

function extractPathParams(pathname) {
  const params = [];
  const re = /\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(pathname))) {
    params.push(m[1]);
  }
  return params;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      // Be polite; also avoids some edge caching oddities.
      "User-Agent": "atlan-api-spec-generator/1.0 (+OpenAPI generator)",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return await res.text();
}

function extractSnippetUrlsFromEndpointsPage(html) {
  const matches = [...html.matchAll(/href=\"(\.\.\/snippets\/[^\"]+)\"/g)].map((m) => m[1]);
  const abs = matches.map((href) => new URL(href, ENDPOINTS_INDEX_URL).toString());
  // Keep only "leaf" pages (heuristic: ends with /)
  return uniq(abs);
}

function uniqUseCases(useCases) {
  const seen = new Set();
  const out = [];
  for (const uc of useCases ?? []) {
    if (!uc?.url) continue;
    if (seen.has(uc.url)) continue;
    seen.add(uc.url);
    out.push(uc);
  }
  return out;
}

function extractEndpointsFromEndpointsPage(html) {
  // Example occurrences in TOC and headings:
  // /api/meta/entity/auditSearch (POST)
  const endpoints = [];
  const re = /(\/api\/[^\s<"]+)\s*\((GET|POST|PUT|PATCH|DELETE)\)/g;
  let m;
  while ((m = re.exec(html))) {
    endpoints.push({ rawPath: m[1], method: m[2].toUpperCase() });
  }
  // Dedup by method+path
  const key = (e) => `${e.method} ${e.rawPath}`;
  const map = new Map();
  for (const e of endpoints) map.set(key(e), e);
  return [...map.values()];
}

function extractRawRestApiExamplesFromPage(html) {
  // mkdocs code blocks are rendered like:
  // <span class="filename">POST /api/...</span> ... <code> ... </code>
  const examples = [];
  const re = /<span class=\"filename\">([^<]+)<\/span>[\s\S]*?<code>([\s\S]*?)<\/code>/g;
  let m;
  while ((m = re.exec(html))) {
    const label = decodeHtmlEntities(stripHtmlTags(m[1])).trim();
    const parsed = parseEndpointLabel(label);
    if (!parsed) continue;

    const rawCodeHtml = m[2];
    const text = decodeHtmlEntities(stripHtmlTags(rawCodeHtml));
    const cleaned = cleanJsonLikeText(text);
    const parsedJson = safeJsonParse(cleaned);

    examples.push({
      method: parsed.method,
      rawPath: parsed.rawPath,
      requestExampleText: cleaned,
      requestExampleJson: parsedJson.ok ? parsedJson.value : undefined,
    });
  }
  return examples;
}

function buildOpenApi({ endpoints, examplesByOperation }) {
  const spec = {
    openapi: "3.0.3",
    info: {
      title: "Atlan Raw REST API (from developer.atlan.com)",
      version: "0.1.0",
      description:
        "OpenAPI spec generated from Atlan developer documentation pages (developer.atlan.com).\n\n" +
        "Notes:\n" +
        "- This spec is best-effort and derived from documentation examples.\n" +
        "- Many request/response schemas are inferred from examples and may be incomplete.\n" +
        "- All endpoints require Bearer token authentication.\n",
    },
    servers: [
      {
        url: "https://{tenant}.atlan.com",
        description: "Atlan tenant base URL",
        variables: {
          tenant: { default: "your-tenant" },
        },
      },
    ],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Atlan API token (Bearer). Generate in Atlan Settings → API Tokens.",
        },
      },
      schemas: {},
    },
    paths: {},
    "x-generated-at": new Date().toISOString(),
    "x-source": {
      endpointsIndex: ENDPOINTS_INDEX_URL,
      allowPrefixes: ALLOW_PREFIXES,
      maxPages: MAX_PAGES,
    },
  };

  // Ensure we include any operations that were only discovered in use-case pages.
  const canonicalKeys = new Set(endpoints.map((e) => `${e.method} ${e.rawPath}`));
  for (const key of examplesByOperation.keys()) {
    if (canonicalKeys.has(key)) continue;
    const [method, ...rest] = key.split(" ");
    const rawPath = rest.join(" ");
    endpoints.push({ method, rawPath });
  }

  for (const ep of endpoints) {
    const opKey = `${ep.method} ${ep.rawPath}`;
    const { pathname, queryParams } = splitPathAndQuery(ep.rawPath);
    if (!spec.paths[pathname]) spec.paths[pathname] = {};

    const pathParamNames = extractPathParams(pathname);

    const operation = {
      operationId: `${ep.method.toLowerCase()}_${pathname.replace(/[^a-zA-Z0-9]/g, "_")}`,
      summary: `${ep.method} ${pathname}`,
      tags: [pathname.split("/").slice(1, 3).join("/") || "Atlan"],
      security: [{ bearerAuth: [] }],
      parameters: [
        ...pathParamNames.map((name) => ({
          name,
          in: "path",
          required: true,
          schema: { type: "string" },
        })),
        ...queryParams.map((qp) => ({
          name: qp.name,
          in: "query",
          required: false,
          schema: { type: "string" },
          example: qp.example,
        })),
      ],
      responses: {
        "200": {
          description: "Success",
          content: {
            "application/json": {
              schema: { type: "object" },
            },
          },
        },
        "400": { description: "Bad request" },
        "401": { description: "Unauthorized" },
        "403": { description: "Forbidden" },
        "404": { description: "Not found" },
        "500": { description: "Server error" },
      },
    };

    const ex = examplesByOperation.get(opKey);
    if (ex?.requestExampleJson && ep.method !== "GET") {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: inferSchemaFromExample(ex.requestExampleJson),
            example: ex.requestExampleJson,
          },
        },
      };
    } else if (ex?.requestExampleText && ep.method !== "GET") {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: { type: "object" },
            example: ex.requestExampleText,
          },
        },
      };
    }

    if (ex?.useCases?.length) {
      const lines = ex.useCases.map((uc) => `- [${uc.title}](${uc.url})`);
      operation.description = `### Use cases\n${lines.join("\n")}\n`;
      operation["x-atlan-useCases"] = ex.useCases;
    }

    spec.paths[pathname][ep.method.toLowerCase()] = operation;
  }

  return spec;
}

async function main() {
  console.log(`Fetching endpoints index: ${ENDPOINTS_INDEX_URL}`);
  const endpointsHtml = await fetchText(ENDPOINTS_INDEX_URL);

  const endpoints = extractEndpointsFromEndpointsPage(endpointsHtml);
  console.log(`Discovered ${endpoints.length} endpoint+method pairs from endpoints index.`);

  const examplesByOperation = new Map();

  const seeds = uniq([ENDPOINTS_INDEX_URL, SNIPPETS_INDEX_URL, RAW_SDK_URL]);
  const queue = [...seeds];
  const seen = new Set(queue);

  const concurrency = 10;

  console.log(
    `Crawling use-case pages (seeds=${seeds.length}, allowPrefixes=${ALLOW_PREFIXES.join(
      ","
    )}, maxPages=${MAX_PAGES}, concurrency=${concurrency}) ...`
  );

  while (queue.length && seen.size <= MAX_PAGES) {
    const batch = queue.splice(0, concurrency);
    const results = await Promise.allSettled(batch.map((url) => fetchText(url)));

    for (let i = 0; i < batch.length; i++) {
      const url = batch[i];
      const r = results[i];
      if (r.status !== "fulfilled") {
        console.warn(`WARN: failed to fetch ${url}: ${String(r.reason)}`);
        continue;
      }

      const html = r.value;
      const title = extractPageTitle(html);

      // Discover more use-case pages.
      for (const link of extractInternalLinks(html, url)) {
        if (seen.has(link)) continue;
        if (seen.size >= MAX_PAGES) break;
        seen.add(link);
        queue.push(link);
      }

      // Extract endpoint examples from this page (if any).
      const examples = extractRawRestApiExamplesFromPage(html);
      for (const ex of examples) {
        const key = `${ex.method} ${ex.rawPath}`;
        const existing = examplesByOperation.get(key);
        const useCase = { title, url };
        if (!existing) {
          examplesByOperation.set(key, { ...ex, useCases: [useCase] });
        } else {
          const merged = {
            ...existing,
            useCases: uniqUseCases([...(existing.useCases ?? []), useCase]),
            requestExampleJson: existing.requestExampleJson ?? ex.requestExampleJson,
            requestExampleText: existing.requestExampleText ?? ex.requestExampleText,
          };
          examplesByOperation.set(key, merged);
        }
      }
    }
  }

  console.log(`Crawled ${seen.size} pages (bounded by maxPages=${MAX_PAGES}).`);
  console.log(`Extracted use-case examples for ${examplesByOperation.size} operations.`);

  const spec = buildOpenApi({ endpoints, examplesByOperation });

  const outPath = path.resolve("src/generated/atlan-openapi.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(spec, null, 2) + "\n", "utf8");

  console.log(`Wrote OpenAPI spec to: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

