#!/usr/bin/env node
/**
 * Integrate QA Response Examples into OpenAPI Spec
 * 
 * This script reads the captured API responses from the QA system
 * and integrates them as response examples into the existing OpenAPI spec files.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '../..');

// Map API paths to OpenAPI path files
const PATH_MAPPING = {
  '/api/meta/search/indexsearch': 'openapi/paths/meta/search-indexsearch.yaml',
  '/api/meta/types/typedefs': 'openapi/paths/meta/types-typedefs.yaml',
  '/api/meta/lineage/list': 'openapi/paths/meta/lineage-list.yaml',
  '/api/meta/entity/guid': 'openapi/paths/meta/entity-guid.yaml',
  '/api/meta/entity/uniqueAttribute/type': 'openapi/paths/meta/entity-unique-attribute.yaml',
  '/api/meta/entity/auditSearch': 'openapi/paths/meta/entity-audit-search.yaml',
  '/api/service/workflows/indexsearch': 'openapi/paths/service/workflows-indexsearch.yaml',
  '/api/service/runs/indexsearch': 'openapi/paths/service/runs-indexsearch.yaml',
};

/**
 * Clean response body for documentation
 */
function cleanResponseForDocs(body, options = {}) {
  if (!body) return body;

  const maxArrayItems = options.maxArrayItems || 2;
  const maxDepth = options.maxDepth || 5;

  const clean = (obj, depth = 0) => {
    if (depth > maxDepth) return '...';
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      if (obj.length === 0) return [];
      const truncated = obj.slice(0, maxArrayItems).map(item => clean(item, depth + 1));
      if (obj.length > maxArrayItems) {
        truncated.push(`... (${obj.length - maxArrayItems} more items)`);
      }
      return truncated;
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip internal fields that aren't useful for docs
      if (key.startsWith('__') && !['__typeName', '__hasLineage', '__state'].includes(key)) {
        continue;
      }
      result[key] = clean(value, depth + 1);
    }
    return result;
  };

  return clean(JSON.parse(JSON.stringify(body)));
}

/**
 * Load QA responses from the report
 */
function loadQAResponses(qaReportPath) {
  const report = JSON.parse(fs.readFileSync(qaReportPath, 'utf-8'));
  return report.responses || [];
}

/**
 * Group responses by endpoint
 */
function groupResponsesByEndpoint(responses) {
  const grouped = {};

  for (const response of responses) {
    if (response.status < 200 || response.status >= 300) continue;
    if (!response.responseBody) continue;

    // Normalize path (remove GUIDs and query params for matching)
    let normalizedPath = response.path
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/guid')
      .replace(/\?.*$/, '');

    // Find matching path file
    let pathFile = null;
    for (const [apiPath, file] of Object.entries(PATH_MAPPING)) {
      if (normalizedPath.startsWith(apiPath) || normalizedPath.includes(apiPath.split('/').slice(-1)[0])) {
        pathFile = file;
        break;
      }
    }

    if (!pathFile) {
      // Try to match by path segment
      const segments = normalizedPath.split('/').filter(Boolean);
      const lastSegment = segments[segments.length - 1];
      for (const [apiPath, file] of Object.entries(PATH_MAPPING)) {
        if (apiPath.includes(lastSegment)) {
          pathFile = file;
          break;
        }
      }
    }

    const key = `${response.method}:${normalizedPath}`;
    if (!grouped[key]) {
      grouped[key] = {
        method: response.method,
        path: normalizedPath,
        pathFile,
        responses: []
      };
    }

    grouped[key].responses.push({
      useCase: response.useCase || 'default',
      chainStep: response.chainStep || 'step',
      status: response.status,
      requestBody: response.requestBody,
      responseBody: cleanResponseForDocs(response.responseBody)
    });
  }

  return grouped;
}

/**
 * Generate YAML response examples
 */
function generateResponseExamples(groupedResponses) {
  const examples = {};

  for (const [key, data] of Object.entries(groupedResponses)) {
    if (!data.pathFile) continue;

    if (!examples[data.pathFile]) {
      examples[data.pathFile] = {
        method: data.method.toLowerCase(),
        responseExamples: {}
      };
    }

    // Deduplicate by use case
    const seenUseCases = new Set();
    for (let i = 0; i < data.responses.length; i++) {
      const resp = data.responses[i];
      const useCaseKey = resp.useCase.replace(/[^a-zA-Z0-9]/g, '_');

      if (seenUseCases.has(useCaseKey)) continue;
      seenUseCases.add(useCaseKey);

      const exampleKey = `${useCaseKey}_response_${i}`;
      examples[data.pathFile].responseExamples[exampleKey] = {
        summary: `${resp.useCase} - Response`,
        'x-useCase': resp.useCase,
        'x-chainStep': resp.chainStep,
        value: resp.responseBody
      };
    }
  }

  return examples;
}

/**
 * Write response examples to a separate YAML file
 */
function writeResponseExamples(examples, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const written = [];

  for (const [pathFile, data] of Object.entries(examples)) {
    if (Object.keys(data.responseExamples).length === 0) continue;

    // Create response examples file
    const baseName = path.basename(pathFile, '.yaml');
    const outputFile = path.join(outputDir, `${baseName}-responses.yaml`);

    const yamlContent = yaml.dump({
      'x-generated': true,
      'x-generatedAt': new Date().toISOString(),
      'x-sourcePathFile': pathFile,
      responseExamples: data.responseExamples
    }, {
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false
    });

    fs.writeFileSync(outputFile, yamlContent);
    written.push(outputFile);
    console.log(`✓ ${outputFile}`);
  }

  return written;
}

/**
 * Simple schema inference (inline version)
 */
function inferSchema(value, depth = 0) {
  if (depth > 5) return { type: 'object' };
  if (value === null || value === undefined) return { type: 'null' };

  const type = Array.isArray(value) ? 'array' : typeof value;

  switch (type) {
    case 'string':
      const schema = { type: 'string' };
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
        schema.format = 'uuid';
      }
      return schema;
    case 'number':
      return { type: Number.isInteger(value) ? 'integer' : 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'array':
      if (value.length === 0) return { type: 'array', items: {} };
      return { type: 'array', items: inferSchema(value[0], depth + 1) };
    case 'object':
      const props = {};
      for (const [k, v] of Object.entries(value)) {
        if (!k.startsWith('__')) {
          props[k] = inferSchema(v, depth + 1);
        }
      }
      return { type: 'object', properties: props };
    default:
      return {};
  }
}

/**
 * Main integration function
 */
async function main() {
  const args = process.argv.slice(2);
  const qaReportPath = args[0] || path.join(ROOT_DIR, 'src/generated/qa/qa-report.json');
  const outputDir = args[1] || path.join(ROOT_DIR, 'src/generated/qa/integrated');

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Integrating QA Responses into OpenAPI Spec               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Check if QA report exists
  if (!fs.existsSync(qaReportPath)) {
    console.error(`Error: QA report not found at ${qaReportPath}`);
    console.error('Run the QA system first: npm run qa');
    process.exit(1);
  }

  console.log(`Loading QA responses from: ${qaReportPath}\n`);

  // Load and group responses
  const responses = loadQAResponses(qaReportPath);
  console.log(`Found ${responses.length} total responses`);

  const successfulResponses = responses.filter(r => r.status >= 200 && r.status < 300);
  console.log(`Successful responses: ${successfulResponses.length}\n`);

  const grouped = groupResponsesByEndpoint(responses);
  console.log(`Grouped into ${Object.keys(grouped).length} endpoint groups\n`);

  // Generate examples
  const examples = generateResponseExamples(grouped);
  console.log(`Generated examples for ${Object.keys(examples).length} path files\n`);

  // Write examples
  console.log('Writing response example files:');
  const written = writeResponseExamples(examples, outputDir);
  console.log(`\nWrote ${written.length} response example files`);

  // Write a combined file for easy integration
  const combinedPath = path.join(outputDir, 'all-response-examples.yaml');
  const combined = {
    'x-generated': true,
    'x-generatedAt': new Date().toISOString(),
    'x-description': 'Combined response examples from QA testing',
    endpoints: {}
  };

  for (const [pathFile, data] of Object.entries(examples)) {
    combined.endpoints[pathFile] = data;
  }

  fs.writeFileSync(combinedPath, yaml.dump(combined, { lineWidth: -1, noRefs: true }));
  console.log(`\n✓ Combined file: ${combinedPath}`);

  // Also write as JSON for programmatic use
  const jsonPath = path.join(outputDir, 'all-response-examples.json');
  fs.writeFileSync(jsonPath, JSON.stringify(combined, null, 2));
  console.log(`✓ JSON format: ${jsonPath}`);

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('Integration complete!');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`\nOutput directory: ${outputDir}`);
  console.log('\nTo use these examples in your OpenAPI spec, you can:');
  console.log('1. Reference them using $ref in your path files');
  console.log('2. Copy the examples directly into your response definitions');
  console.log('3. Use the combined JSON file programmatically\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
