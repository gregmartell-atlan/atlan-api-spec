/**
 * Extract Raw REST API code blocks from Atlan common examples pages.
 *
 * - Fetches each /snippets/common-examples/* page
 * - Extracts mkdocs-material code blocks whose filename is "POST /api/meta/entity/bulk"
 * - Outputs JSON to stdout: { pageUrl, blocks: [{ label, code }] }
 *
 * Usage:
 *   node scripts/extract-common-examples-raw-rest.mjs > /tmp/common-examples-raw-rest.json
 */

// Common examples (common asset actions)
const COMMON_PAGES = [
  "https://developer.atlan.com/snippets/common-examples/certificates/",
  "https://developer.atlan.com/snippets/common-examples/announcements/",
  "https://developer.atlan.com/snippets/common-examples/descriptions/",
  "https://developer.atlan.com/snippets/common-examples/owners/",
  "https://developer.atlan.com/snippets/common-examples/tags/",
  "https://developer.atlan.com/snippets/common-examples/custom-metadata/",
  "https://developer.atlan.com/snippets/common-examples/term-assignment/",
  "https://developer.atlan.com/snippets/common-examples/domain-assignment/",
  "https://developer.atlan.com/snippets/common-examples/readme/",
  "https://developer.atlan.com/snippets/common-examples/resources/",
  "https://developer.atlan.com/snippets/common-examples/relationship-attributes/",
];

// Advanced examples (Asset CRUD)
const CRUD_PAGES = [
  "https://developer.atlan.com/snippets/advanced-examples/create/",
  "https://developer.atlan.com/snippets/advanced-examples/read/",
  "https://developer.atlan.com/snippets/advanced-examples/update/",
  "https://developer.atlan.com/snippets/advanced-examples/delete/",
  "https://developer.atlan.com/snippets/advanced-examples/restore/",
];

// Lineage pages
const LINEAGE_PAGES = [
  "https://developer.atlan.com/snippets/common-examples/lineage/",
  "https://developer.atlan.com/snippets/common-examples/lineage/manage/",
  "https://developer.atlan.com/snippets/common-examples/lineage/traverse/",
];

const PAGES = [...COMMON_PAGES, ...CRUD_PAGES, ...LINEAGE_PAGES];

function decodeHtmlEntities(input) {
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

function normalizeNewlines(s) {
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "atlan-api-spec-generator/1.0 (+snippet extractor)" },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return await res.text();
}

// List of API endpoints we want to extract (method + path patterns)
const ENDPOINT_PATTERNS = [
  /^(POST|GET|PUT|DELETE)\s+\/api\/meta\/entity\/bulk/i,
  /^(POST|GET|PUT|DELETE)\s+\/api\/meta\/entity\/guid/i,
  /^(POST|GET|PUT|DELETE)\s+\/api\/meta\/entity\/uniqueAttribute/i,
  /^(POST)\s+\/api\/meta\/lineage/i,
  /^(DELETE)\s+\/api\/meta\/entity\/bulk/i,
];

function matchesEndpoint(label) {
  return ENDPOINT_PATTERNS.some((p) => p.test(label));
}

function extractCodeBlocks(html) {
  // mkdocs-material renders code blocks like:
  // <span class="filename">POST /api/meta/entity/bulk</span> ... <code> ... </code>
  const blocks = [];
  const re = /<span class=\"filename\">([^<]+)<\/span>[\s\S]*?<code>([\s\S]*?)<\/code>/g;
  let m;
  while ((m = re.exec(html))) {
    const label = decodeHtmlEntities(stripHtmlTags(m[1])).trim();
    if (!matchesEndpoint(label)) continue;
    const codeHtml = m[2];
    const code = normalizeNewlines(decodeHtmlEntities(stripHtmlTags(codeHtml))).trim();
    blocks.push({ label, code });
  }
  return blocks;
}

async function main() {
  const out = [];
  for (const pageUrl of PAGES) {
    const html = await fetchText(pageUrl);
    const blocks = extractCodeBlocks(html);
    out.push({ pageUrl, blocks });
  }
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

