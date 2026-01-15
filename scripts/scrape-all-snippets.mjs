#!/usr/bin/env node
/**
 * Scrape all snippets from developer.atlan.com/snippets
 * and generate use case YAML files with FULL CONTEXT
 * 
 * This script:
 * 1. Fetches the sitemap to get all snippet URLs
 * 2. Crawls each snippet page
 * 3. Extracts FULL documentation context including:
 *    - Section headings (h2, h3)
 *    - Explanatory text for each section
 *    - Notes, warnings, tips (admonitions)
 *    - Code examples with their context
 * 4. Generates rich use case YAML files
 * 
 * Usage:
 *   node scripts/scrape-all-snippets.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = "https://developer.atlan.com";
const SITEMAP_URL = `${ROOT}/sitemap.xml`;
const OUTPUT_DIR = "openapi/use-cases";

// Concurrency for crawling
const CONCURRENCY = 5;

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
    .replaceAll("¶", ""); // Pilcrow character used as heading anchor
}

function stripHtmlTags(input) {
  return input.replace(/<[^>]*>/g, "");
}

function extractPageTitle(html) {
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(stripHtmlTags(titleMatch[1])).trim() : undefined;

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = h1Match ? decodeHtmlEntities(stripHtmlTags(h1Match[1])).trim() : undefined;

  // Remove " - Developer" suffix from title
  const cleanTitle = (h1 || title || "Untitled").replace(/ - Developer$/, "").trim();
  return cleanTitle;
}

// Extract the main content area
function extractMainContent(html) {
  // Try to get just the article/main content
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) return articleMatch[1];
  
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) return mainMatch[1];
  
  return html;
}

// Extract page introduction (first paragraphs before any h2)
function extractIntroduction(html) {
  const content = extractMainContent(html);
  
  // Find content before first h2
  const h2Index = content.search(/<h2[^>]*>/i);
  if (h2Index === -1) return "";
  
  const introHtml = content.substring(0, h2Index);
  
  // Extract paragraphs
  const paragraphs = [];
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pRe.exec(introHtml))) {
    const text = decodeHtmlEntities(stripHtmlTags(m[1])).trim();
    if (text && text.length > 10) {
      paragraphs.push(text);
    }
  }
  
  return paragraphs.join('\n\n');
}

// Extract all sections with their headings, descriptions, and code blocks
function extractSections(html) {
  const content = extractMainContent(html);
  const sections = [];
  
  // Split by h2 headings
  const h2Re = /<h2[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h2>/gi;
  const h2Matches = [...content.matchAll(h2Re)];
  
  for (let i = 0; i < h2Matches.length; i++) {
    const match = h2Matches[i];
    const nextMatch = h2Matches[i + 1];
    
    const sectionId = match[1];
    const sectionTitle = decodeHtmlEntities(stripHtmlTags(match[2])).trim();
    
    // Get content between this h2 and the next one
    const startIdx = match.index + match[0].length;
    const endIdx = nextMatch ? nextMatch.index : content.length;
    const sectionContent = content.substring(startIdx, endIdx);
    
    // Extract description paragraphs (before any code blocks)
    const description = extractSectionDescription(sectionContent);
    
    // Extract admonitions (notes, warnings, tips)
    const admonitions = extractAdmonitions(sectionContent);
    
    // Extract code examples
    const examples = extractCodeExamples(sectionContent);
    
    // Extract subsections (h3)
    const subsections = extractSubsections(sectionContent);
    
    sections.push({
      id: sectionId,
      title: sectionTitle,
      description,
      admonitions,
      examples,
      subsections,
    });
  }
  
  return sections;
}

function extractSectionDescription(sectionHtml) {
  // Get paragraphs before the first code block or tabbed content
  const codeBlockIdx = sectionHtml.search(/<div class="highlight"|<div class="tabbed-/i);
  const textBeforeCode = codeBlockIdx > 0 ? sectionHtml.substring(0, codeBlockIdx) : sectionHtml;
  
  const paragraphs = [];
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pRe.exec(textBeforeCode))) {
    const text = decodeHtmlEntities(stripHtmlTags(m[1])).trim();
    if (text && text.length > 10 && !text.startsWith('Cookie consent')) {
      paragraphs.push(text);
    }
  }
  
  return paragraphs.join('\n\n');
}

function extractAdmonitions(sectionHtml) {
  const admonitions = [];
  
  // mkdocs admonitions have class like "admonition note", "admonition warning", etc.
  const adRe = /<div class="admonition\s+(\w+)"[^>]*>[\s\S]*?<p class="admonition-title"[^>]*>([\s\S]*?)<\/p>([\s\S]*?)<\/div>/gi;
  let m;
  while ((m = adRe.exec(sectionHtml))) {
    const type = m[1]; // note, warning, tip, info, etc.
    const title = decodeHtmlEntities(stripHtmlTags(m[2])).trim();
    const content = decodeHtmlEntities(stripHtmlTags(m[3])).trim();
    
    if (content) {
      admonitions.push({ type, title, content });
    }
  }
  
  return admonitions;
}

function extractSubsections(sectionHtml) {
  const subsections = [];
  
  const h3Re = /<h3[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h3>/gi;
  const h3Matches = [...sectionHtml.matchAll(h3Re)];
  
  for (let i = 0; i < h3Matches.length; i++) {
    const match = h3Matches[i];
    const nextMatch = h3Matches[i + 1];
    
    const subsectionId = match[1];
    const subsectionTitle = decodeHtmlEntities(stripHtmlTags(match[2])).trim();
    
    const startIdx = match.index + match[0].length;
    const endIdx = nextMatch ? nextMatch.index : sectionHtml.length;
    const subsectionContent = sectionHtml.substring(startIdx, endIdx);
    
    const description = extractSectionDescription(subsectionContent);
    const examples = extractCodeExamples(subsectionContent);
    
    subsections.push({
      id: subsectionId,
      title: subsectionTitle,
      description,
      examples,
    });
  }
  
  return subsections;
}

function cleanJsonLikeText(text) {
  // Remove line comments
  const noLineComments = text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");

  // Remove inline // comments (best-effort)
  const noInlineComments = noLineComments.replace(/\s\/\/.*$/gm, "");

  // Remove trailing commas before closing braces/brackets
  return noInlineComments.replace(/,\s*([}\]])/g, "$1").trim();
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function parseEndpointLabel(label) {
  const m = label.trim().match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/\S+)$/i);
  if (!m) return null;
  return { method: m[1].toUpperCase(), rawPath: m[2] };
}

function extractCodeExamples(sectionHtml) {
  const examples = [];
  
  // Look for code blocks with filename labels (Raw REST API examples)
  const re = /<span class="filename">([^<]+)<\/span>[\s\S]*?<code[^>]*>([\s\S]*?)<\/code>/gi;
  let m;
  while ((m = re.exec(sectionHtml))) {
    const label = decodeHtmlEntities(stripHtmlTags(m[1])).trim();
    const parsed = parseEndpointLabel(label);
    
    const rawCodeHtml = m[2];
    const text = decodeHtmlEntities(stripHtmlTags(rawCodeHtml));
    const cleaned = cleanJsonLikeText(text);
    const parsedJson = safeJsonParse(cleaned);

    if (parsed) {
      // This is a REST API example
      examples.push({
        type: 'rest',
        method: parsed.method,
        endpoint: parsed.rawPath.split("?")[0],
        queryString: parsed.rawPath.includes("?") ? parsed.rawPath.split("?")[1] : undefined,
        requestBody: parsedJson.ok ? parsedJson.value : undefined,
        requestBodyRaw: !parsedJson.ok && cleaned ? cleaned : undefined,
      });
    } else if (label && cleaned) {
      // Other code block (Python, Java, etc.)
      examples.push({
        type: 'sdk',
        language: label.toLowerCase(),
        code: cleaned,
      });
    }
  }
  
  return examples;
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

async function getSnippetUrls() {
  console.log("Fetching sitemap...");
  const sitemapXml = await fetchText(SITEMAP_URL);
  
  // Extract all URLs
  const urlMatches = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  const urls = urlMatches.map(m => m[1]);
  
  // Filter to only /snippets/ URLs
  const snippetUrls = urls.filter(url => url.includes("/snippets/"));
  
  console.log(`Found ${snippetUrls.length} snippet URLs`);
  return snippetUrls;
}

function urlToCategory(url) {
  const path = new URL(url).pathname;
  const parts = path.split("/").filter(Boolean);
  if (parts.length >= 2) {
    return parts[1];
  }
  return "general";
}

function urlToFilename(url) {
  const path = new URL(url).pathname;
  const parts = path.split("/").filter(Boolean);
  const meaningfulParts = parts.slice(1);
  if (meaningfulParts.length === 0) return "index";
  return meaningfulParts.join("-");
}

function urlToId(url) {
  return urlToFilename(url).replace(/[^a-z0-9-]/gi, "-").toLowerCase();
}

// Map categories to output directories
const CATEGORY_MAPPING = {
  "common-examples": "common-actions",
  "advanced-examples": "crud",
  "custom-metadata": "governance",
  "tags": "governance",
  "access": "access-control",
  "users-groups": "access-control",
  "workflows": "workflows",
  "datamesh": "data-mesh",
  "datacontract": "data-contracts",
  "files": "asset-specific",
  "search-logs": "search",
};

function getOutputCategory(url) {
  const category = urlToCategory(url);
  return CATEGORY_MAPPING[category] || category;
}

// Escape text for YAML
function yamlEscape(text) {
  if (!text) return "";
  // Remove problematic characters and normalize whitespace
  return text
    .replace(/[^\x20-\x7E\n]/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

// Indent text for YAML multiline
function yamlIndent(text, spaces = 2) {
  if (!text) return "";
  const indent = ' '.repeat(spaces);
  return text.split('\n').map(line => indent + line).join('\n');
}

// Generate YAML content for a use case with FULL context
function generateUseCaseYaml(pageData) {
  const { url, title, introduction, sections } = pageData;
  
  const id = urlToId(url);
  const category = getOutputCategory(url);
  
  // Build description from introduction
  const description = yamlEscape(introduction || title || "").substring(0, 500);
  
  let yaml = `# Use Case: ${title}
# Auto-generated from: ${url}
# Generated at: ${new Date().toISOString()}

id: ${id}
title: "${title.replace(/"/g, '\\"')}"
category: ${category}
icon: zap

description: >-
  ${description.split('\n').join('\n  ')}

externalDocs:
  url: ${url}
  description: Official Atlan documentation

`;

  // Generate steps from sections
  if (sections && sections.length > 0) {
    yaml += `steps:\n`;
    
    let stepNumber = 1;
    
    for (const section of sections) {
      // Each section with REST examples becomes a step
      const restExamples = section.examples.filter(e => e.type === 'rest');
      
      if (restExamples.length > 0 || section.description) {
        // Create a step for this section
        yaml += `  - step: ${stepNumber}
    title: "${yamlEscape(section.title).replace(/"/g, '\\"')}"
`;
        
        // Add section description
        if (section.description) {
          yaml += `    description: >-
      ${yamlEscape(section.description).split('\n').join('\n      ')}
`;
        }
        
        // Add admonitions as a notes list (to avoid duplicate keys)
        if (section.admonitions && section.admonitions.length > 0) {
          yaml += `    notes:\n`;
          for (const adm of section.admonitions) {
            yaml += `      - type: ${adm.type}
        title: "${yamlEscape(adm.title).replace(/"/g, '\\"')}"
        content: >-
          ${yamlEscape(adm.content).split('\n').join('\n          ')}
`;
          }
        }
        
        // Add REST API examples
        if (restExamples.length > 0) {
          const firstExample = restExamples[0];
          yaml += `    method: ${firstExample.method}
    endpoint: ${firstExample.endpoint}
`;
          if (firstExample.queryString) {
            const escapedQs = firstExample.queryString.replace(/'/g, "''");
            yaml += `    queryString: '${escapedQs}'
`;
          }
          
          yaml += `    examples:\n`;
          
          for (let i = 0; i < restExamples.length; i++) {
            const ex = restExamples[i];
            yaml += `      - key: example-${stepNumber}-${i + 1}
        summary: "${ex.method} ${ex.endpoint}"
`;
            if (ex.requestBody) {
              yaml += `        request: ${JSON.stringify(ex.requestBody, null, 10).split('\n').join('\n          ')}
`;
            } else if (ex.requestBodyRaw) {
              yaml += `        requestRaw: |
          ${ex.requestBodyRaw.split('\n').join('\n          ')}
`;
            }
          }
        }
        
        // Process subsections
        for (const sub of section.subsections || []) {
          const subRestExamples = sub.examples.filter(e => e.type === 'rest');
          if (subRestExamples.length > 0 || sub.description) {
            stepNumber++;
            yaml += `  - step: ${stepNumber}
    title: "${yamlEscape(sub.title).replace(/"/g, '\\"')}"
`;
            if (sub.description) {
              yaml += `    description: >-
      ${yamlEscape(sub.description).split('\n').join('\n      ')}
`;
            }
            
            if (subRestExamples.length > 0) {
              const firstExample = subRestExamples[0];
              yaml += `    method: ${firstExample.method}
    endpoint: ${firstExample.endpoint}
`;
              if (firstExample.queryString) {
                const escapedQs = firstExample.queryString.replace(/'/g, "''");
                yaml += `    queryString: '${escapedQs}'
`;
              }
              
              yaml += `    examples:\n`;
              for (let i = 0; i < subRestExamples.length; i++) {
                const ex = subRestExamples[i];
                yaml += `      - key: example-${stepNumber}-${i + 1}
        summary: "${ex.method} ${ex.endpoint}"
`;
                if (ex.requestBody) {
                  yaml += `        request: ${JSON.stringify(ex.requestBody, null, 10).split('\n').join('\n          ')}
`;
                } else if (ex.requestBodyRaw) {
                  yaml += `        requestRaw: |
          ${ex.requestBodyRaw.split('\n').join('\n          ')}
`;
                }
              }
            }
          }
        }
        
        stepNumber++;
      }
    }
  }

  return yaml;
}

// Create the use case file
async function createUseCaseFile(pageData) {
  const category = getOutputCategory(pageData.url);
  const filename = urlToId(pageData.url) + ".yaml";
  
  const categoryDir = path.join(OUTPUT_DIR, category);
  await fs.mkdir(categoryDir, { recursive: true });
  
  const filePath = path.join(categoryDir, filename);
  const yamlContent = generateUseCaseYaml(pageData);
  
  await fs.writeFile(filePath, yamlContent, "utf8");
  return filePath;
}

// Process a single page with FULL context extraction
async function processPage(url) {
  try {
    const html = await fetchText(url);
    const title = extractPageTitle(html);
    const introduction = extractIntroduction(html);
    const sections = extractSections(html);
    
    // Count total REST examples
    let totalExamples = 0;
    for (const section of sections) {
      totalExamples += section.examples.filter(e => e.type === 'rest').length;
      for (const sub of section.subsections || []) {
        totalExamples += sub.examples.filter(e => e.type === 'rest').length;
      }
    }
    
    return {
      url,
      title,
      introduction,
      sections,
      sectionCount: sections.length,
      exampleCount: totalExamples,
      hasExamples: totalExamples > 0,
    };
  } catch (error) {
    console.error(`Error processing ${url}: ${error.message}`);
    return {
      url,
      title: "Unknown",
      introduction: "",
      sections: [],
      sectionCount: 0,
      exampleCount: 0,
      hasExamples: false,
      error: error.message,
    };
  }
}

// Process pages in batches
async function processBatch(urls) {
  return Promise.all(urls.map(processPage));
}

async function main() {
  console.log("=== Atlan Snippets Scraper (Full Context) ===\n");
  
  // Get all snippet URLs
  const urls = await getSnippetUrls();
  
  // Process in batches
  const allPages = [];
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    console.log(`Processing batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(urls.length / CONCURRENCY)} (${batch.length} pages)...`);
    const results = await processBatch(batch);
    allPages.push(...results);
  }
  
  console.log(`\nProcessed ${allPages.length} pages`);
  
  // Filter pages with examples
  const pagesWithExamples = allPages.filter(p => p.hasExamples);
  console.log(`Found ${pagesWithExamples.length} pages with Raw REST API examples`);
  
  // Group by category
  const byCategory = {};
  for (const page of allPages) {
    const category = getOutputCategory(page.url);
    if (!byCategory[category]) byCategory[category] = [];
    byCategory[category].push(page);
  }
  
  console.log("\nPages by category:");
  for (const [cat, pages] of Object.entries(byCategory)) {
    const withExamples = pages.filter(p => p.hasExamples).length;
    const totalSections = pages.reduce((sum, p) => sum + p.sectionCount, 0);
    console.log(`  ${cat}: ${pages.length} pages (${withExamples} with examples, ${totalSections} sections)`);
  }
  
  // Create use case files
  console.log("\nCreating use case files with full context...");
  const createdFiles = [];
  
  for (const page of allPages) {
    // Skip index pages
    if (page.url.endsWith("/snippets/")) continue;
    
    const filePath = await createUseCaseFile(page);
    createdFiles.push({ path: filePath, page });
    console.log(`  Created: ${filePath} (${page.sectionCount} sections, ${page.exampleCount} examples)`);
  }
  
  // Generate index file
  const indexContent = generateIndexYaml(byCategory, allPages);
  const indexPath = path.join(OUTPUT_DIR, "_index-generated.yaml");
  await fs.writeFile(indexPath, indexContent, "utf8");
  console.log(`\nGenerated index: ${indexPath}`);
  
  // Summary report
  console.log("\n=== Summary ===");
  console.log(`Total pages processed: ${allPages.length}`);
  console.log(`Pages with examples: ${pagesWithExamples.length}`);
  console.log(`Total sections extracted: ${allPages.reduce((sum, p) => sum + p.sectionCount, 0)}`);
  console.log(`Total examples extracted: ${allPages.reduce((sum, p) => sum + p.exampleCount, 0)}`);
  console.log(`Use case files created: ${createdFiles.length}`);
  console.log(`Categories: ${Object.keys(byCategory).length}`);
  
  // Write detailed report
  const reportPath = "src/generated/snippets-report.json";
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalPages: allPages.length,
    pagesWithExamples: pagesWithExamples.length,
    totalSections: allPages.reduce((sum, p) => sum + p.sectionCount, 0),
    totalExamples: allPages.reduce((sum, p) => sum + p.exampleCount, 0),
    categories: Object.keys(byCategory).length,
    pages: allPages.map(p => ({
      url: p.url,
      title: p.title,
      sectionCount: p.sectionCount,
      exampleCount: p.exampleCount,
      category: getOutputCategory(p.url),
      sections: p.sections.map(s => ({
        title: s.title,
        hasDescription: !!s.description,
        exampleCount: s.examples.length,
        subsectionCount: (s.subsections || []).length,
      })),
    })),
  }, null, 2), "utf8");
  console.log(`Report saved: ${reportPath}`);
}

function generateIndexYaml(byCategory, allPages) {
  let yaml = `# Use Cases Index - Auto-generated from developer.atlan.com/snippets
# Generated at: ${new Date().toISOString()}
# Total pages: ${allPages.length}
# Total sections: ${allPages.reduce((sum, p) => sum + p.sectionCount, 0)}
# Total examples: ${allPages.reduce((sum, p) => sum + p.exampleCount, 0)}

version: "1.0"

categories:
`;

  for (const [category, pages] of Object.entries(byCategory)) {
    yaml += `  - id: ${category}
    name: ${category.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
    useCases:
`;
    for (const page of pages) {
      if (page.url.endsWith("/snippets/")) continue;
      const filename = urlToId(page.url) + ".yaml";
      yaml += `      - $ref: './${category}/${filename}'
`;
    }
  }

  return yaml;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
