/**
 * Generate OpenAPI path files from extracted examples.
 * 
 * This script reads the extracted examples from developer.atlan.com
 * and generates/updates OpenAPI path YAML files with all examples.
 * 
 * Usage:
 *   node scripts/generate-openapi-examples.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Read extracted examples
const extractedPath = path.join(PROJECT_ROOT, 'src/generated/all-examples-raw-rest.json');
const extracted = JSON.parse(fs.readFileSync(extractedPath, 'utf-8'));

// Group examples by endpoint
const endpointExamples = {};
for (const page of extracted) {
  for (const block of page.blocks) {
    const key = `${block.method}:${block.endpoint}`;
    if (!endpointExamples[key]) {
      endpointExamples[key] = [];
    }
    endpointExamples[key].push({
      ...block,
      pageUrl: page.pageUrl,
      tag: page.tag,
      category: page.category,
      pageTitle: page.title,
    });
  }
}

// Escape YAML special chars in strings
function escapeYamlString(s) {
  if (typeof s !== 'string') return s;
  // If contains special chars, quote it
  if (/[:{}[\],&*#?|\-<>=!%@`]/.test(s) || s.includes('\n')) {
    return JSON.stringify(s);
  }
  return s;
}

// Convert JSON to YAML (simple version for our use case)
function jsonToYaml(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  if (obj === null) return 'null';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';
  if (typeof obj === 'number') return String(obj);
  if (typeof obj === 'string') return escapeYamlString(obj);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return '\n' + obj.map(item => {
      const itemYaml = jsonToYaml(item, indent + 1);
      if (typeof item === 'object' && item !== null) {
        return `${pad}- ${itemYaml.trimStart()}`;
      }
      return `${pad}- ${itemYaml}`;
    }).join('\n');
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    return entries.map(([key, value]) => {
      const valueYaml = jsonToYaml(value, indent + 1);
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return `${pad}${key}:\n${valueYaml}`;
      }
      if (Array.isArray(value) && value.length > 0) {
        return `${pad}${key}:${valueYaml}`;
      }
      return `${pad}${key}: ${valueYaml}`;
    }).join('\n');
  }
  return String(obj);
}

// Create a safe example key from page URL and index
function makeExampleKey(example, idx) {
  const pathPart = example.pageUrl
    .replace('https://developer.atlan.com/snippets/', '')
    .replace(/\//g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');
  return `${pathPart}_${idx}`;
}

// Parse JSON from code block (strip comments)
function parseJsonFromCode(code) {
  // Remove // comments (but keep strings with // in them)
  const lines = code.split('\n');
  const cleanedLines = lines.map(line => {
    // Find // that's not inside a string
    let inString = false;
    let stringChar = null;
    let result = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const prev = line[i - 1];
      
      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
        result += char;
      } else if (inString && char === stringChar && prev !== '\\') {
        inString = false;
        stringChar = null;
        result += char;
      } else if (!inString && char === '/' && line[i + 1] === '/') {
        // Found a comment, stop here
        break;
      } else {
        result += char;
      }
    }
    return result;
  });
  
  const cleaned = cleanedLines.join('\n');
  
  try {
    // Try to parse, handling trailing commas
    const fixedJson = cleaned
      .replace(/,(\s*[}\]])/g, '$1')  // Remove trailing commas
      .replace(/\.\.\./g, '"..."');   // Replace ... with placeholder
    return JSON.parse(fixedJson);
  } catch (e) {
    return null;  // Could not parse
  }
}

// Generate examples for a specific endpoint
function generateExamplesYaml(examples) {
  const lines = [];
  
  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i];
    const key = makeExampleKey(ex, i);
    
    lines.push(`          ${key}:`);
    lines.push(`            summary: "${ex.tag} - ${ex.pageTitle || 'Example'}"`);
    lines.push(`            x-useCaseTag: "${ex.tag}"`);
    lines.push(`            x-docUrl: ${ex.pageUrl}`);
    
    // Add the raw snippet
    const codeLines = ex.code.split('\n');
    lines.push(`            x-atlanSnippet: |-`);
    for (const codeLine of codeLines) {
      lines.push(`              ${codeLine}`);
    }
    
    // Try to parse into a structured value
    const parsedValue = parseJsonFromCode(ex.code);
    if (parsedValue) {
      lines.push(`            value:`);
      const valueYaml = jsonToYaml(parsedValue, 7);
      lines.push(valueYaml);
    }
    
    lines.push('');
  }
  
  return lines.join('\n');
}

// Generate summary stats
console.log('=== Extracted Examples Summary ===');
console.log(`Total pages: ${extracted.length}`);
console.log(`Total examples: ${extracted.reduce((sum, p) => sum + p.blocks.length, 0)}`);
console.log('\nEndpoints with examples:');

const sortedEndpoints = Object.entries(endpointExamples)
  .sort((a, b) => b[1].length - a[1].length);

for (const [endpoint, examples] of sortedEndpoints) {
  console.log(`  ${endpoint}: ${examples.length} examples`);
}

// Write a summary file that can be used to update the OpenAPI spec
const summaryPath = path.join(PROJECT_ROOT, 'src/generated/examples-by-endpoint.json');
fs.writeFileSync(summaryPath, JSON.stringify(endpointExamples, null, 2));
console.log(`\nWrote summary to: ${summaryPath}`);

// Generate a complete examples YAML file for entity/bulk (the main endpoint)
const entityBulkKey = 'POST:/api/meta/entity/bulk';
if (endpointExamples[entityBulkKey]) {
  const examplesYaml = generateExamplesYaml(endpointExamples[entityBulkKey]);
  const outputPath = path.join(PROJECT_ROOT, 'src/generated/entity-bulk-examples.yaml');
  fs.writeFileSync(outputPath, examplesYaml);
  console.log(`\nWrote entity/bulk examples to: ${outputPath}`);
}

// Generate search examples
const searchKey = 'POST:/api/meta/search/indexsearch';
if (endpointExamples[searchKey]) {
  const examplesYaml = generateExamplesYaml(endpointExamples[searchKey]);
  const outputPath = path.join(PROJECT_ROOT, 'src/generated/search-examples.yaml');
  fs.writeFileSync(outputPath, examplesYaml);
  console.log(`Wrote search examples to: ${outputPath}`);
}

// Generate workflow examples
const workflowSearchKey = 'POST:/api/service/workflows/indexsearch';
if (endpointExamples[workflowSearchKey]) {
  const examplesYaml = generateExamplesYaml(endpointExamples[workflowSearchKey]);
  const outputPath = path.join(PROJECT_ROOT, 'src/generated/workflow-search-examples.yaml');
  fs.writeFileSync(outputPath, examplesYaml);
  console.log(`Wrote workflow search examples to: ${outputPath}`);
}

const workflowSubmitKey = 'POST:/api/service/workflows/submit';
if (endpointExamples[workflowSubmitKey]) {
  const examplesYaml = generateExamplesYaml(endpointExamples[workflowSubmitKey]);
  const outputPath = path.join(PROJECT_ROOT, 'src/generated/workflow-submit-examples.yaml');
  fs.writeFileSync(outputPath, examplesYaml);
  console.log(`Wrote workflow submit examples to: ${outputPath}`);
}

// Generate lineage examples  
const lineageListKey = 'POST:/api/meta/lineage/list';
if (endpointExamples[lineageListKey]) {
  const examplesYaml = generateExamplesYaml(endpointExamples[lineageListKey]);
  const outputPath = path.join(PROJECT_ROOT, 'src/generated/lineage-list-examples.yaml');
  fs.writeFileSync(outputPath, examplesYaml);
  console.log(`Wrote lineage list examples to: ${outputPath}`);
}

// Generate typedefs examples
const typedefsKey = 'POST:/api/meta/types/typedefs';
if (endpointExamples[typedefsKey]) {
  const examplesYaml = generateExamplesYaml(endpointExamples[typedefsKey]);
  const outputPath = path.join(PROJECT_ROOT, 'src/generated/typedefs-examples.yaml');
  fs.writeFileSync(outputPath, examplesYaml);
  console.log(`Wrote typedefs examples to: ${outputPath}`);
}

console.log('\nDone!');
