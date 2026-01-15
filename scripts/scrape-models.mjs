#!/usr/bin/env node
/**
 * Scrape all model/entity documentation from developer.atlan.com/models/
 * 
 * OPTIMIZED VERSION:
 * - Only includes entity types (skips structs/enums for smaller bundle)
 * - Generates a lightweight index file for initial load (~50KB)
 * - Generates individual entity detail files for on-demand loading
 * - Strips verbose descriptions from the index
 * 
 * Output structure:
 *   src/generated/models-index.json      - Lightweight index (~50KB gzipped)
 *   public/models/{entityId}.json        - Individual entity details (loaded on-demand)
 * 
 * Usage:
 *   node scripts/scrape-models.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = "https://developer.atlan.com";
const SITEMAP_URL = `${ROOT}/sitemap.xml`;
const INDEX_OUTPUT = "src/generated/models-index.json";
const DETAILS_OUTPUT_DIR = "public/models";

// Concurrency for crawling
const CONCURRENCY = 10;

// HTML entity decoding
function decodeHtmlEntities(input) {
  return input
    .replaceAll("&quot;", '"')
    .replaceAll("&#34;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&para;", "")
    .replaceAll("¶", "");
}

function stripHtmlTags(input) {
  return input.replace(/<[^>]*>/g, "");
}

function extractPageTitle(html) {
  const h1Match = html.match(/<h1[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    return {
      id: h1Match[1],
      title: decodeHtmlEntities(stripHtmlTags(h1Match[2])).trim()
    };
  }
  
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(stripHtmlTags(titleMatch[1])).trim() : "Unknown";
  return { id: title.toLowerCase().replace(/\s+/g, '-'), title: title.replace(/ - Developer$/, "") };
}

// Extract the main content area
function extractMainContent(html) {
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) return articleMatch[1];
  return html;
}

// Parse type icon to get the type name
function parseTypeFromIcons(iconHtml) {
  const typePatterns = [
    { pattern: /title="string"/, type: 'string' },
    { pattern: /title="boolean"/, type: 'boolean' },
    { pattern: /title="long"/, type: 'long' },
    { pattern: /title="int"/, type: 'int' },
    { pattern: /title="double"/, type: 'double' },
    { pattern: /title="float"/, type: 'float' },
    { pattern: /title="timestamp"/, type: 'timestamp' },
    { pattern: /title="date"/, type: 'date' },
    { pattern: /title="enum"/, type: 'enum' },
    { pattern: /title="array of strings"/, type: 'array<string>' },
    { pattern: /title="array of objects"/, type: 'array<object>' },
    { pattern: /title="map \/ dict"/, type: 'map' },
    { pattern: /title="object"/, type: 'object' },
  ];
  
  for (const { pattern, type } of typePatterns) {
    if (pattern.test(iconHtml)) return type;
  }
  return 'unknown';
}

// Check if property is read-only
function isReadOnly(iconHtml) {
  return /title="read-only"/.test(iconHtml);
}

// Extract properties from h3 headings
function extractProperties(content) {
  const properties = [];
  
  // Match h3 with id and content (property definitions)
  const h3Re = /<h3[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h3>/gi;
  let match;
  
  while ((match = h3Re.exec(content))) {
    const propId = match[1];
    const propContent = match[2];
    
    // Skip non-property headings
    if (propId === 'properties' || propId === 'relationships') continue;
    
    // Extract property name (text before the first span)
    const nameMatch = propContent.match(/^([^<]+)/);
    const name = nameMatch ? nameMatch[1].trim() : propId;
    
    // Extract type from icons
    const type = parseTypeFromIcons(propContent);
    const readOnly = isReadOnly(propContent);
    
    // Get description - look for next paragraph after this h3
    const afterH3 = content.substring(match.index + match[0].length);
    const descMatch = afterH3.match(/^[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    const description = descMatch 
      ? decodeHtmlEntities(stripHtmlTags(descMatch[1])).trim().substring(0, 300)
      : undefined;
    
    properties.push({
      name,
      type,
      readOnly,
      description: description || undefined,
    });
  }
  
  return properties;
}

// Extract entity description
function extractDescription(content) {
  // Find first paragraph after h1
  const h1End = content.search(/<\/h1>/i);
  if (h1End === -1) return "";
  
  const afterH1 = content.substring(h1End);
  const firstPara = afterH1.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (firstPara) {
    const text = decodeHtmlEntities(stripHtmlTags(firstPara[1])).trim();
    // Skip if it's just warning text
    if (!text.startsWith("This is reference documentation")) {
      return text.substring(0, 300);
    }
  }
  return "";
}

// Extract inheritance info from mermaid diagram or text
function extractInheritance(content) {
  const inherits = [];
  const seen = new Set();
  
  // Look for "extends" in mermaid
  const extendsRe = /(\w+)\s*<\|--\s*(\w+)\s*:\s*extends/g;
  let match;
  while ((match = extendsRe.exec(content))) {
    if (!seen.has(match[1])) {
      inherits.push(match[1]);
      seen.add(match[1]);
    }
  }
  
  // Also look for text mentions
  const textExtendsRe = /extends\s+(\w+)/gi;
  while ((match = textExtendsRe.exec(content))) {
    if (!seen.has(match[1])) {
      inherits.push(match[1]);
      seen.add(match[1]);
    }
  }
  
  return inherits;
}

// Determine entity category from URL
function getCategory(url) {
  const urlPath = new URL(url).pathname;
  const parts = urlPath.split('/').filter(Boolean);
  
  if (parts.includes('entities')) return 'entity';
  if (parts.includes('enums')) return 'enum';
  if (parts.includes('structs')) return 'struct';
  
  // Get the category from the path
  if (parts.length >= 2) {
    return parts[1];
  }
  return 'other';
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "atlan-api-spec-generator/1.0 (+OpenAPI generator)",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.text();
}

async function getModelUrls() {
  console.log("Fetching sitemap...");
  const sitemapXml = await fetchText(SITEMAP_URL);
  
  // Extract all URLs
  const urlMatches = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  const urls = urlMatches.map(m => m[1]);
  
  // Filter to only /models/entities/ URLs (skip enums and structs for optimization)
  const entityUrls = urls.filter(url => url.includes("/models/entities/"));
  
  console.log(`Found ${entityUrls.length} entity URLs (skipping enums/structs for optimization)`);
  return entityUrls;
}

async function processPage(url) {
  try {
    const html = await fetchText(url);
    const content = extractMainContent(html);
    const { id, title } = extractPageTitle(html);
    const description = extractDescription(content);
    const properties = extractProperties(content);
    const inheritance = extractInheritance(content);
    const category = getCategory(url);
    
    return {
      url,
      id,
      title,
      category,
      description: description || undefined,
      properties: properties.length > 0 ? properties : undefined,
      inheritance: inheritance.length > 0 ? inheritance : undefined,
      propertyCount: properties.length,
    };
  } catch (error) {
    console.error(`Error processing ${url}: ${error.message}`);
    return {
      url,
      id: "error",
      title: "Error",
      category: "error",
      error: error.message,
      propertyCount: 0,
    };
  }
}

// Process pages in batches
async function processBatch(urls) {
  return Promise.all(urls.map(processPage));
}

async function main() {
  console.log("=== Atlan Models Scraper (Optimized) ===\n");
  
  // Get all entity URLs (skip enums/structs)
  const urls = await getModelUrls();
  
  // Process in batches
  const allPages = [];
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    console.log(`Processing batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(urls.length / CONCURRENCY)} (${batch.length} pages)...`);
    const results = await processBatch(batch);
    allPages.push(...results);
  }
  
  console.log(`\nProcessed ${allPages.length} entity pages`);
  
  // Filter to valid entities with properties
  const validEntities = allPages.filter(p => p.propertyCount > 0 && !p.error);
  
  console.log(`Valid entities with properties: ${validEntities.length}`);
  
  // Create output directories
  await fs.mkdir(path.dirname(INDEX_OUTPUT), { recursive: true });
  await fs.mkdir(DETAILS_OUTPUT_DIR, { recursive: true });
  
  // Generate individual entity detail files (for on-demand loading)
  console.log(`\nWriting ${validEntities.length} individual entity files...`);
  for (const entity of validEntities) {
    const detailFile = path.join(DETAILS_OUTPUT_DIR, `${entity.id}.json`);
    const detailData = {
      id: entity.id,
      title: entity.title,
      url: entity.url,
      description: entity.description,
      inheritance: entity.inheritance,
      properties: entity.properties,
    };
    await fs.writeFile(detailFile, JSON.stringify(detailData), "utf8");
  }
  
  // Generate lightweight index (no property details, no descriptions)
  const indexData = {
    generatedAt: new Date().toISOString(),
    totalEntities: validEntities.length,
    totalProperties: validEntities.reduce((sum, p) => sum + p.propertyCount, 0),
    entities: validEntities.map(e => ({
      id: e.id,
      title: e.title,
      propertyCount: e.propertyCount,
      // Include first 10 property names for search (without full details)
      searchableProps: e.properties?.slice(0, 10).map(p => p.name) || [],
    })).sort((a, b) => a.title.localeCompare(b.title)),
  };
  
  await fs.writeFile(INDEX_OUTPUT, JSON.stringify(indexData), "utf8");
  
  // Calculate sizes
  const indexSize = JSON.stringify(indexData).length;
  const totalDetailSize = validEntities.reduce((sum, e) => {
    return sum + JSON.stringify({
      id: e.id,
      title: e.title,
      url: e.url,
      description: e.description,
      inheritance: e.inheritance,
      properties: e.properties,
    }).length;
  }, 0);
  
  console.log(`\n=== Summary ===`);
  console.log(`Entity pages scraped: ${allPages.length}`);
  console.log(`Valid entities: ${validEntities.length}`);
  console.log(`Total properties: ${indexData.totalProperties}`);
  console.log(`\nOutput files:`);
  console.log(`  Index: ${INDEX_OUTPUT} (${(indexSize / 1024).toFixed(1)} KB)`);
  console.log(`  Details: ${DETAILS_OUTPUT_DIR}/*.json (${validEntities.length} files, ${(totalDetailSize / 1024).toFixed(1)} KB total)`);
  console.log(`\nOptimization:`);
  console.log(`  - Index loads on initial page view (~${(indexSize / 1024).toFixed(0)} KB)`);
  console.log(`  - Entity details load on-demand when user clicks an entity`);
  console.log(`  - Typical entity detail: ~${(totalDetailSize / validEntities.length / 1024).toFixed(1)} KB per entity`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
