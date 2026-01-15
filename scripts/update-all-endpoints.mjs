/**
 * Update all OpenAPI path files with extracted examples.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Read examples by endpoint
const examplesPath = path.join(PROJECT_ROOT, 'src/generated/examples-by-endpoint.json');
const endpointExamples = JSON.parse(fs.readFileSync(examplesPath, 'utf-8'));

// Helper functions
function makeKey(tag, idx) {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') + `_${idx}`;
}

// Generate a descriptive summary based on the code content
function generateSummary(tag, code, idx) {
  const lowerCode = code.toLowerCase();
  
  // For search operations, try to identify what's being searched
  if (tag.includes('Search') || tag.includes('crawler') || tag.includes('miner')) {
    if (lowerCode.includes('size": 0') || lowerCode.includes('size":0')) return `${tag} - aggregations only`;
    if (lowerCode.includes('track_total_hits')) return `${tag} - with count`;
    if (lowerCode.includes('from": 0') && lowerCode.includes('size": 100')) return `${tag} - paginated`;
  }
  
  // For workflow submissions, identify the workflow type
  if (tag.includes('crawler') || tag.includes('miner')) {
    if (lowerCode.includes('credential-guid')) return `${tag} - with credentials`;
    if (lowerCode.includes('connection')) return `${tag} - connection config`;
    return `${tag} - full configuration`;
  }
  
  // For lineage operations
  if (tag.includes('lineage') || tag.includes('Lineage')) {
    if (lowerCode.includes('upstream') || lowerCode.includes('input')) return `${tag} - upstream`;
    if (lowerCode.includes('downstream') || lowerCode.includes('output')) return `${tag} - downstream`;
  }
  
  // Default: use index to differentiate
  const variants = ['example 1', 'example 2', 'example 3', 'example 4', 'example 5'];
  return `${tag} - ${variants[idx % variants.length]}`;
}

function parseJson(code) {
  try {
    const lines = code.split('\n');
    const cleaned = lines.map(line => {
      let inString = false;
      let result = '';
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const prev = i > 0 ? line[i-1] : '';
        if (!inString && char === '"') {
          inString = true;
          result += char;
        } else if (inString && char === '"' && prev !== '\\') {
          inString = false;
          result += char;
        } else if (!inString && char === '/' && line[i+1] === '/') {
          break;
        } else {
          result += char;
        }
      }
      return result;
    }).join('\n');
    const fixed = cleaned.replace(/,(\s*[}\]])/g, '$1').replace(/\.\.\./g, '"..."');
    return JSON.parse(fixed);
  } catch (e) {
    return null;
  }
}

function toYaml(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  if (obj === null) return 'null';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';
  if (typeof obj === 'number') return String(obj);
  if (typeof obj === 'string') {
    if (obj === '' || obj.includes('\n') || obj.includes(':') || 
        obj.includes('#') || obj.includes('"') || obj.includes("'") ||
        obj.startsWith(' ') || obj.endsWith(' ') ||
        /^[{[]/.test(obj) || obj === 'true' || obj === 'false' ||
        obj === 'null' || obj === '...' || !isNaN(Number(obj))) {
      return JSON.stringify(obj);
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    const items = obj.map(item => {
      if (typeof item === 'object' && item !== null) {
        const itemYaml = toYaml(item, indent + 2);
        const lines = itemYaml.split('\n');
        if (lines.length > 0) lines[0] = lines[0].trimStart();
        return `${pad}  - ${lines.join('\n')}`;
      }
      return `${pad}  - ${toYaml(item, 0)}`;
    });
    return '\n' + items.join('\n');
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    return entries.map(([key, val]) => {
      const safeKey = /[:\s#{}[\],&*?|<>=!%@`]/.test(key) ? `"${key}"` : key;
      if (typeof val === 'object' && val !== null) {
        const valYaml = toYaml(val, indent + 1);
        if (Array.isArray(val)) {
          // For empty arrays, inline on same line; for non-empty, newline
          if (val.length === 0) {
            return `${pad}${safeKey}: []`;
          }
          return `${pad}${safeKey}:${valYaml}`;
        }
        // For empty objects, inline on same line
        if (Object.keys(val).length === 0) {
          return `${pad}${safeKey}: {}`;
        }
        return `${pad}${safeKey}:\n${valYaml}`;
      }
      return `${pad}${safeKey}: ${toYaml(val, 0)}`;
    }).join('\n');
  }
  return String(obj);
}

function generateExamples(examples, startIndent = 10) {
  const pad = ' '.repeat(startIndent);
  const lines = [];
  const usedKeys = new Set();
  
  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i];
    let key = makeKey(ex.tag, i);
    while (usedKeys.has(key)) {
      key = key + '_' + Math.random().toString(36).substr(2, 4);
    }
    usedKeys.add(key);
    
    // Generate descriptive summary
    const summary = generateSummary(ex.tag, ex.code, i);
    
    lines.push(`${pad}${key}:`);
    lines.push(`${pad}  summary: "${summary}"`);
    lines.push(`${pad}  x-useCaseTag: "${ex.tag}"`);
    lines.push(`${pad}  x-docUrl: ${ex.pageUrl}`);
    lines.push(`${pad}  x-atlanSnippet: |-`);
    ex.code.split('\n').forEach(codeLine => {
      lines.push(`${pad}    ${codeLine}`);
    });
    
    const parsed = parseJson(ex.code);
    if (parsed) {
      lines.push(`${pad}  value:`);
      lines.push(toYaml(parsed, 7));
    }
    lines.push('');
  }
  return lines.join('\n');
}

// === Update search-indexsearch.yaml ===
const searchExamples = endpointExamples['POST:/api/meta/search/indexsearch'] || [];
if (searchExamples.length > 0) {
  const searchTags = [...new Set(searchExamples.map(ex => ex.tag))];
  const searchYaml = `post:
  operationId: searchAssets
  summary: Search for assets
  description: |
    Search Atlan's metadata catalog using an Elasticsearch-style DSL.

    This is the primary search endpoint used throughout Atlan for finding assets,
    filtering by type, status, ownership, tags, and more.

    See [Searching reference](https://developer.atlan.com/search/) for query patterns.

    ## Use cases
    - [Search assets](https://developer.atlan.com/snippets/common-examples/finding/)
    - [Search examples](https://developer.atlan.com/snippets/common-examples/finding/examples/)
  externalDocs:
    url: https://developer.atlan.com/snippets/common-examples/finding/examples/
    description: Search examples and patterns
  tags:
${searchTags.map(t => `    - "${t}"`).join('\n')}
  security:
    - AtlanToken: []
  requestBody:
    required: true
    content:
      application/json:
        schema:
          $ref: '../../components/schemas/Search.yaml#/MetaIndexSearchRequest'
        examples:
${generateExamples(searchExamples)}
  responses:
    '200':
      description: Search results
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/Search.yaml#/MetaIndexSearchResponse'
    '400':
      description: Invalid DSL or attributes specification
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
    '401':
      description: Missing or invalid token
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
    '500':
      description: Internal search error
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
`;
  fs.writeFileSync(path.join(PROJECT_ROOT, 'openapi/paths/meta/search-indexsearch.yaml'), searchYaml);
  console.log(`Updated search-indexsearch.yaml with ${searchExamples.length} examples`);
}

// === Update lineage-list.yaml ===
const lineageListExamples = endpointExamples['POST:/api/meta/lineage/list'] || [];
if (lineageListExamples.length > 0) {
  const lineageTags = [...new Set(lineageListExamples.map(ex => ex.tag))];
  const lineageYaml = `post:
  operationId: traverseLineage
  summary: Traverse lineage graph
  description: |
    Traverse the lineage graph starting from a specific asset.
    Returns upstream (sources) or downstream (targets) lineage.

    ## Use cases
    - [Traverse lineage](https://developer.atlan.com/snippets/common-examples/lineage/traverse/)
  externalDocs:
    url: https://developer.atlan.com/snippets/common-examples/lineage/traverse/
    description: Lineage traversal examples
  tags:
${lineageTags.map(t => `    - "${t}"`).join('\n')}
  security:
    - AtlanToken: []
  requestBody:
    required: true
    content:
      application/json:
        schema:
          $ref: '../../components/schemas/Lineage.yaml#/LineageListRequest'
        examples:
${generateExamples(lineageListExamples)}
  responses:
    '200':
      description: Lineage traversal results
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/Lineage.yaml#/LineageListResponse'
    '400':
      description: Invalid request
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
    '401':
      description: Missing or invalid token
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
    '404':
      description: Asset not found
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
    '500':
      description: Internal error
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
`;
  fs.writeFileSync(path.join(PROJECT_ROOT, 'openapi/paths/meta/lineage-list.yaml'), lineageYaml);
  console.log(`Updated lineage-list.yaml with ${lineageListExamples.length} examples`);
}

// === Update types-typedefs.yaml ===
const typedefsPostExamples = endpointExamples['POST:/api/meta/types/typedefs'] || [];
const typedefsPutExamples = endpointExamples['PUT:/api/meta/types/typedefs'] || [];
if (typedefsPostExamples.length > 0 || typedefsPutExamples.length > 0) {
  const allTypedefExamples = [...typedefsPostExamples, ...typedefsPutExamples];
  const typedefTags = [...new Set(allTypedefExamples.map(ex => ex.tag))];
  const typedefsYaml = `post:
  operationId: createTypeDefs
  summary: Create type definitions
  description: |
    Create new type definitions (custom metadata structures, tags/classifications).

    ## Use cases
    - [Create custom metadata](https://developer.atlan.com/snippets/custom-metadata/create/)
    - [Manage tag definitions](https://developer.atlan.com/snippets/tags/manage/)
  externalDocs:
    url: https://developer.atlan.com/snippets/custom-metadata/create/
    description: Custom metadata creation examples
  tags:
${typedefTags.map(t => `    - "${t}"`).join('\n')}
  security:
    - AtlanToken: []
  requestBody:
    required: true
    content:
      application/json:
        schema:
          $ref: '../../components/schemas/TypeDefs.yaml#/TypeDefRequest'
        examples:
${generateExamples(typedefsPostExamples)}
  responses:
    '200':
      description: Type definitions created
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/TypeDefs.yaml#/TypeDefResponse'
    '400':
      description: Invalid type definition
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
    '401':
      description: Missing or invalid token
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
    '409':
      description: Type definition already exists
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
    '500':
      description: Internal error
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'

put:
  operationId: updateTypeDefs
  summary: Update type definitions
  description: |
    Update existing type definitions (custom metadata structures, tags/classifications).

    ## Use cases
    - [Update custom metadata](https://developer.atlan.com/snippets/custom-metadata/update/)
    - [Manage tag definitions](https://developer.atlan.com/snippets/tags/manage/)
  externalDocs:
    url: https://developer.atlan.com/snippets/custom-metadata/update/
    description: Custom metadata update examples
  tags:
${typedefTags.map(t => `    - "${t}"`).join('\n')}
  security:
    - AtlanToken: []
  requestBody:
    required: true
    content:
      application/json:
        schema:
          $ref: '../../components/schemas/TypeDefs.yaml#/TypeDefRequest'
        examples:
${generateExamples(typedefsPutExamples)}
  responses:
    '200':
      description: Type definitions updated
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/TypeDefs.yaml#/TypeDefResponse'
    '400':
      description: Invalid type definition
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
    '401':
      description: Missing or invalid token
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
    '404':
      description: Type definition not found
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
    '500':
      description: Internal error
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'

get:
  operationId: getTypeDefs
  summary: Get all type definitions
  description: |
    Retrieve all type definitions from the Atlan instance.
  tags:
    - "Custom metadata structures"
    - "Tag (classification) structures"
  security:
    - AtlanToken: []
  responses:
    '200':
      description: All type definitions
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/TypeDefs.yaml#/TypeDefResponse'
    '401':
      description: Missing or invalid token
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
    '500':
      description: Internal error
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
`;
  fs.writeFileSync(path.join(PROJECT_ROOT, 'openapi/paths/meta/types-typedefs.yaml'), typedefsYaml);
  console.log(`Updated types-typedefs.yaml with ${allTypedefExamples.length} examples`);
}

// === Create service/workflows-indexsearch.yaml if it doesn't exist ===
const workflowSearchExamples = endpointExamples['POST:/api/service/workflows/indexsearch'] || [];
if (workflowSearchExamples.length > 0) {
  const workflowTags = [...new Set(workflowSearchExamples.map(ex => ex.tag))];
  const workflowSearchYaml = `post:
  operationId: searchWorkflows
  summary: Search workflows
  description: |
    Search for workflows using an Elasticsearch-style DSL.

    ## Use cases
    - [Manage workflows](https://developer.atlan.com/snippets/workflows/manage/workflows/)
  externalDocs:
    url: https://developer.atlan.com/snippets/workflows/manage/workflows/
    description: Workflow management examples
  tags:
${workflowTags.map(t => `    - "${t}"`).join('\n')}
  security:
    - AtlanToken: []
  requestBody:
    required: true
    content:
      application/json:
        schema:
          $ref: '../../components/schemas/Search.yaml#/WorkflowSearchRequest'
        examples:
${generateExamples(workflowSearchExamples)}
  responses:
    '200':
      description: Search results
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/Search.yaml#/WorkflowSearchResponse'
    '400':
      description: Invalid request
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
    '401':
      description: Missing or invalid token
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
    '500':
      description: Internal error
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
`;
  fs.writeFileSync(path.join(PROJECT_ROOT, 'openapi/paths/service/workflows-indexsearch.yaml'), workflowSearchYaml);
  console.log(`Updated workflows-indexsearch.yaml with ${workflowSearchExamples.length} examples`);
}

// === Create service/workflows-submit.yaml ===
const workflowSubmitExamples = endpointExamples['POST:/api/service/workflows/submit'] || [];
if (workflowSubmitExamples.length > 0) {
  const submitTags = [...new Set(workflowSubmitExamples.map(ex => ex.tag))];
  const workflowSubmitYaml = `post:
  operationId: submitWorkflow
  summary: Submit a workflow for execution
  description: |
    Submit a workflow package for execution with the specified parameters.

    ## Use cases
    - [Workflow packages](https://developer.atlan.com/snippets/workflows/packages/)
    - Crawler configurations
    - Asset import/export
    - Lineage builders
  externalDocs:
    url: https://developer.atlan.com/snippets/workflows/packages/
    description: Workflow package examples
  tags:
${submitTags.map(t => `    - "${t}"`).join('\n')}
  security:
    - AtlanToken: []
  requestBody:
    required: true
    content:
      application/json:
        schema:
          $ref: '../../components/schemas/Workflow.yaml#/WorkflowSubmitRequest'
        examples:
${generateExamples(workflowSubmitExamples)}
  responses:
    '200':
      description: Workflow submitted successfully
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/Workflow.yaml#/WorkflowSubmitResponse'
    '400':
      description: Invalid workflow configuration
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
    '401':
      description: Missing or invalid token
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
    '404':
      description: Workflow package not found
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
    '500':
      description: Internal error
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
`;
  
  // Create service directory if it doesn't exist
  const serviceDir = path.join(PROJECT_ROOT, 'openapi/paths/service');
  if (!fs.existsSync(serviceDir)) {
    fs.mkdirSync(serviceDir, { recursive: true });
  }
  
  fs.writeFileSync(path.join(serviceDir, 'workflows-submit.yaml'), workflowSubmitYaml);
  console.log(`Created/updated workflows-submit.yaml with ${workflowSubmitExamples.length} examples`);
}

console.log('\nDone updating all endpoints!');
