/**
 * Extract Raw REST API code blocks from ALL Atlan documentation pages.
 *
 * - Fetches each documentation page
 * - Extracts mkdocs-material code blocks for REST API calls
 * - Outputs JSON with all examples
 *
 * Usage:
 *   node scripts/extract-all-examples.mjs > src/generated/all-examples-raw-rest.json
 */

// ===== COMPLETE LIST OF ALL DOCUMENTATION PAGES (from sitemap.xml) =====

const ALL_PAGES = [
  // Common Asset Actions
  { url: "https://developer.atlan.com/snippets/common-examples/certificates/", tag: "Certify assets", category: "Common Asset Actions" },
  { url: "https://developer.atlan.com/snippets/common-examples/announcements/", tag: "Manage announcements", category: "Common Asset Actions" },
  { url: "https://developer.atlan.com/snippets/common-examples/descriptions/", tag: "Change description", category: "Common Asset Actions" },
  { url: "https://developer.atlan.com/snippets/common-examples/owners/", tag: "Change owners", category: "Common Asset Actions" },
  { url: "https://developer.atlan.com/snippets/common-examples/tags/", tag: "Tag (classify) assets", category: "Common Asset Actions" },
  { url: "https://developer.atlan.com/snippets/common-examples/custom-metadata/", tag: "Change custom metadata", category: "Common Asset Actions" },
  { url: "https://developer.atlan.com/snippets/common-examples/term-assignment/", tag: "Link terms to assets", category: "Common Asset Actions" },
  { url: "https://developer.atlan.com/snippets/common-examples/domain-assignment/", tag: "Link domains to assets", category: "Common Asset Actions" },
  { url: "https://developer.atlan.com/snippets/common-examples/readme/", tag: "Manage asset READMEs", category: "Common Asset Actions" },
  { url: "https://developer.atlan.com/snippets/common-examples/resources/", tag: "Add asset resources", category: "Common Asset Actions" },
  { url: "https://developer.atlan.com/snippets/common-examples/relationship-attributes/", tag: "Manage relationships", category: "Common Asset Actions" },
  
  // Asset CRUD Operations
  { url: "https://developer.atlan.com/snippets/advanced-examples/create/", tag: "Create assets", category: "Asset CRUD Operations" },
  { url: "https://developer.atlan.com/snippets/advanced-examples/read/", tag: "Retrieve assets", category: "Asset CRUD Operations" },
  { url: "https://developer.atlan.com/snippets/advanced-examples/update/", tag: "Update assets", category: "Asset CRUD Operations" },
  { url: "https://developer.atlan.com/snippets/advanced-examples/delete/", tag: "Delete assets", category: "Asset CRUD Operations" },
  { url: "https://developer.atlan.com/snippets/advanced-examples/suggestions/", tag: "Find and apply suggestions", category: "Asset CRUD Operations" },
  { url: "https://developer.atlan.com/snippets/advanced-examples/restore/", tag: "Restore assets", category: "Asset CRUD Operations" },
  { url: "https://developer.atlan.com/snippets/advanced-examples/history/", tag: "Review audit history", category: "Asset CRUD Operations" },
  { url: "https://developer.atlan.com/snippets/advanced-examples/combine/", tag: "Combine operations", category: "Asset CRUD Operations" },
  
  // Search
  { url: "https://developer.atlan.com/snippets/advanced-examples/search/", tag: "Search assets", category: "Search" },
  { url: "https://developer.atlan.com/snippets/common-examples/finding/", tag: "Find assets", category: "Search" },
  { url: "https://developer.atlan.com/snippets/common-examples/finding/examples/", tag: "Search examples", category: "Search" },
  
  // Lineage
  { url: "https://developer.atlan.com/snippets/common-examples/lineage/", tag: "Lineage overview", category: "Lineage" },
  { url: "https://developer.atlan.com/snippets/common-examples/lineage/manage/", tag: "Manage lineage", category: "Lineage" },
  { url: "https://developer.atlan.com/snippets/common-examples/lineage/traverse/", tag: "Traverse lineage", category: "Lineage" },
  { url: "https://developer.atlan.com/snippets/common-examples/lineage/parse-sql/", tag: "Parse SQL for lineage", category: "Lineage" },

  // Glossary Operations
  { url: "https://developer.atlan.com/snippets/common-examples/glossary/", tag: "Glossary overview", category: "Glossary" },
  { url: "https://developer.atlan.com/snippets/common-examples/glossary/create/", tag: "Create glossary objects", category: "Glossary" },
  { url: "https://developer.atlan.com/snippets/common-examples/glossary/retrieve-by-name/", tag: "Retrieve glossary by name", category: "Glossary" },
  { url: "https://developer.atlan.com/snippets/common-examples/glossary/create-hierarchy/", tag: "Create glossary hierarchy", category: "Glossary" },
  { url: "https://developer.atlan.com/snippets/common-examples/glossary/categorize-terms/", tag: "Categorize glossary terms", category: "Glossary" },
  { url: "https://developer.atlan.com/snippets/common-examples/glossary/hierarchy/", tag: "Traverse glossary hierarchy", category: "Glossary" },

  // Data Mesh
  { url: "https://developer.atlan.com/snippets/datamesh/", tag: "Data Mesh overview", category: "Data Mesh" },
  { url: "https://developer.atlan.com/snippets/datamesh/datadomains/", tag: "Manage Data Domains", category: "Data Mesh" },
  { url: "https://developer.atlan.com/snippets/datamesh/dataproducts/", tag: "Manage Data Products", category: "Data Mesh" },

  // Custom Metadata Structures
  { url: "https://developer.atlan.com/snippets/custom-metadata/", tag: "Custom metadata overview", category: "Custom Metadata" },
  { url: "https://developer.atlan.com/snippets/custom-metadata/create/", tag: "Create custom metadata", category: "Custom Metadata" },
  { url: "https://developer.atlan.com/snippets/custom-metadata/read/", tag: "Read custom metadata", category: "Custom Metadata" },
  { url: "https://developer.atlan.com/snippets/custom-metadata/update/", tag: "Update custom metadata", category: "Custom Metadata" },
  { url: "https://developer.atlan.com/snippets/custom-metadata/delete/", tag: "Delete custom metadata", category: "Custom Metadata" },
  { url: "https://developer.atlan.com/snippets/custom-metadata/badge/", tag: "Custom metadata badges", category: "Custom Metadata" },
  { url: "https://developer.atlan.com/snippets/custom-metadata/enums/", tag: "Custom metadata enums", category: "Custom Metadata" },

  // Tags / Classifications
  { url: "https://developer.atlan.com/snippets/tags/", tag: "Tags overview", category: "Tags" },
  { url: "https://developer.atlan.com/snippets/tags/manage/", tag: "Manage tag definitions", category: "Tags" },
  { url: "https://developer.atlan.com/snippets/tags/monitor-propagation/", tag: "Monitor tag propagation", category: "Tags" },

  // Data Contracts
  { url: "https://developer.atlan.com/snippets/datacontract/", tag: "Data contracts overview", category: "Data Contracts" },
  { url: "https://developer.atlan.com/snippets/datacontract/manage/", tag: "Manage data contracts", category: "Data Contracts" },
  { url: "https://developer.atlan.com/snippets/datacontract/manage-via-sdks/", tag: "Data contracts via SDKs", category: "Data Contracts" },

  // Users and Groups
  { url: "https://developer.atlan.com/snippets/users-groups/", tag: "Users & Groups overview", category: "Users & Groups" },
  { url: "https://developer.atlan.com/snippets/users-groups/create/", tag: "Create users & groups", category: "Users & Groups" },
  { url: "https://developer.atlan.com/snippets/users-groups/read/", tag: "Read users & groups", category: "Users & Groups" },
  { url: "https://developer.atlan.com/snippets/users-groups/update/", tag: "Update users & groups", category: "Users & Groups" },
  { url: "https://developer.atlan.com/snippets/users-groups/delete/", tag: "Delete users & groups", category: "Users & Groups" },
  { url: "https://developer.atlan.com/snippets/users-groups/sso-group-mapping/", tag: "SSO group mapping", category: "Users & Groups" },

  // Access Control
  { url: "https://developer.atlan.com/snippets/access/", tag: "Access control overview", category: "Access Control" },
  { url: "https://developer.atlan.com/snippets/access/personas/", tag: "Manage personas", category: "Access Control" },
  { url: "https://developer.atlan.com/snippets/access/purposes/", tag: "Manage purposes", category: "Access Control" },
  { url: "https://developer.atlan.com/snippets/access/policies/", tag: "Manage policies", category: "Access Control" },
  { url: "https://developer.atlan.com/snippets/access/tokens/", tag: "Manage API tokens", category: "Access Control" },
  { url: "https://developer.atlan.com/snippets/access/queries/", tag: "Query access logs", category: "Access Control" },
  { url: "https://developer.atlan.com/snippets/access/events/", tag: "Access events", category: "Access Control" },

  // Workflows
  { url: "https://developer.atlan.com/snippets/workflows/", tag: "Workflows overview", category: "Workflows" },
  { url: "https://developer.atlan.com/snippets/workflows/manage/workflows/", tag: "Manage workflows", category: "Workflows" },
  { url: "https://developer.atlan.com/snippets/workflows/manage/schedules/", tag: "Manage schedules", category: "Workflows" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/", tag: "Workflow packages overview", category: "Workflows" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/snowflake-assets/", tag: "Snowflake crawler", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/snowflake-miner/", tag: "Snowflake miner", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/bigquery-assets/", tag: "BigQuery crawler", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/redshift-assets/", tag: "Redshift crawler", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/databricks-assets/", tag: "Databricks crawler", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/databricks-miner/", tag: "Databricks miner", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/postgres-assets/", tag: "PostgreSQL crawler", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/oracle-assets/", tag: "Oracle crawler", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/sql-server-assets/", tag: "SQL Server crawler", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/athena-assets/", tag: "Athena crawler", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/glue-assets/", tag: "AWS Glue crawler", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/dynamodb-assets/", tag: "DynamoDB crawler", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/mongodb-assets/", tag: "MongoDB crawler", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/confluent-kafka-assets/", tag: "Kafka crawler", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/dbt-assets/", tag: "dbt crawler", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/looker-assets/", tag: "Looker crawler", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/tableau-assets/", tag: "Tableau crawler", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/powerbi-assets/", tag: "Power BI crawler", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/sigma-assets/", tag: "Sigma crawler", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/fivetran-enrichment/", tag: "Fivetran enrichment", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/asset-import/", tag: "Asset import", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/asset-export-basic/", tag: "Asset export", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/relational-assets-builder/", tag: "Relational assets builder", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/lineage-builder/", tag: "Lineage builder", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/lineage-generator-nt/", tag: "Lineage generator (no transformation)", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/connection-delete/", tag: "Connection delete", category: "Workflow Packages" },
  { url: "https://developer.atlan.com/snippets/workflows/packages/api-token-connection-admin/", tag: "API token connection admin", category: "Workflow Packages" },

  // Profiling & Popularity
  { url: "https://developer.atlan.com/snippets/common-examples/profiling-and-popularity/", tag: "Profiling & Popularity overview", category: "Profiling & Popularity" },
  { url: "https://developer.atlan.com/snippets/common-examples/profiling-and-popularity/profiling/", tag: "Profiling", category: "Profiling & Popularity" },
  { url: "https://developer.atlan.com/snippets/common-examples/profiling-and-popularity/popularity/", tag: "Popularity", category: "Profiling & Popularity" },

  // Files
  { url: "https://developer.atlan.com/snippets/files/", tag: "File operations", category: "Files" },

  // Search Logs
  { url: "https://developer.atlan.com/snippets/search-logs/", tag: "Search logs", category: "Search Logs" },
];

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
  if (!res.ok) {
    console.error(`WARN: Failed to fetch ${url}: ${res.status} ${res.statusText}`);
    return null;
  }
  return await res.text();
}

// List of API endpoints we want to extract (method + path patterns)
const ENDPOINT_PATTERNS = [
  /^(POST|GET|PUT|DELETE|PATCH)\s+\/api\//i,
];

function matchesEndpoint(label) {
  return ENDPOINT_PATTERNS.some((p) => p.test(label));
}

function extractCodeBlocks(html, pageUrl) {
  // mkdocs-material renders code blocks like:
  // <span class="filename">POST /api/meta/entity/bulk</span> ... <code> ... </code>
  const blocks = [];
  const re = /<span class=\"filename\">([^<]+)<\/span>[\s\S]*?<code>([\s\S]*?)<\/code>/g;
  let m;
  let idx = 0;
  while ((m = re.exec(html))) {
    const label = decodeHtmlEntities(stripHtmlTags(m[1])).trim();
    if (!matchesEndpoint(label)) continue;
    const codeHtml = m[2];
    const code = normalizeNewlines(decodeHtmlEntities(stripHtmlTags(codeHtml))).trim();
    
    // Extract method and endpoint from label
    const methodMatch = label.match(/^(GET|POST|PUT|DELETE|PATCH)\s+(.+)/i);
    const method = methodMatch ? methodMatch[1].toUpperCase() : "POST";
    const endpoint = methodMatch ? methodMatch[2].split("?")[0] : label;
    
    blocks.push({ 
      id: `${pageUrl.replace(/[^a-zA-Z0-9]/g, "_")}_${idx++}`,
      label, 
      method,
      endpoint,
      code 
    });
  }
  return blocks;
}

// Extract section headers to map examples to specific use cases
function extractSectionHeaders(html) {
  const headers = [];
  const re = /<h[23][^>]*id="([^"]+)"[^>]*>([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    headers.push({ id: m[1], title: m[2].trim() });
  }
  return headers;
}

// Extract the page title
function extractTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return m ? decodeHtmlEntities(m[1]).replace(/ - Developer$/, "").trim() : null;
}

async function main() {
  const results = [];
  let successCount = 0;
  let failCount = 0;
  let totalBlocks = 0;
  
  console.error(`Extracting examples from ${ALL_PAGES.length} pages...`);
  
  for (const page of ALL_PAGES) {
    console.error(`  Fetching: ${page.url}`);
    const html = await fetchText(page.url);
    if (!html) {
      failCount++;
      results.push({ 
        pageUrl: page.url, 
        tag: page.tag,
        category: page.category,
        blocks: [],
        error: "Failed to fetch"
      });
      continue;
    }
    
    const blocks = extractCodeBlocks(html, page.url);
    const sections = extractSectionHeaders(html);
    const title = extractTitle(html);
    
    results.push({
      pageUrl: page.url,
      tag: page.tag,
      category: page.category,
      title,
      sections,
      blocks,
    });
    
    successCount++;
    totalBlocks += blocks.length;
    console.error(`    Found ${blocks.length} code blocks`);
  }
  
  console.error(`\nDone! Success: ${successCount}, Failed: ${failCount}`);
  console.error(`Total code blocks extracted: ${totalBlocks}`);
  
  process.stdout.write(JSON.stringify(results, null, 2) + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
