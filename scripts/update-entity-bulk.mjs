/**
 * Update entity-bulk.yaml with all extracted examples.
 * 
 * This script reads the examples-by-endpoint.json and generates
 * a complete entity-bulk.yaml file with all examples.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Read examples by endpoint
const examplesPath = path.join(PROJECT_ROOT, 'src/generated/examples-by-endpoint.json');
const endpointExamples = JSON.parse(fs.readFileSync(examplesPath, 'utf-8'));

// Group POST /api/meta/entity/bulk examples by tag
const postExamples = endpointExamples['POST:/api/meta/entity/bulk'] || [];
const deleteExamples = endpointExamples['DELETE:/api/meta/entity/bulk'] || [];

// Get unique tags from examples
const tagCounts = {};
for (const ex of postExamples) {
  tagCounts[ex.tag] = (tagCounts[ex.tag] || 0) + 1;
}

console.log('POST /api/meta/entity/bulk examples by tag:');
Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).forEach(([tag, count]) => {
  console.log(`  ${tag}: ${count}`);
});

// Generate example key
function makeKey(tag, idx) {
  return tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') + `_${idx}`;
}

// Generate a descriptive summary based on the code content
function generateSummary(tag, code, idx, allExamples) {
  const lowerCode = code.toLowerCase();
  
  // Check for remove/null patterns
  if (lowerCode.includes(': null') || lowerCode.includes('": null')) {
    if (lowerCode.includes('certificatestatus')) return `Remove certificate`;
    if (lowerCode.includes('announcementtype')) return `Remove announcement`;
    if (lowerCode.includes('description')) return `Remove description`;
    if (lowerCode.includes('ownerusers')) return `Remove owners`;
    if (lowerCode.includes('meanings')) return `Remove linked terms`;
    if (lowerCode.includes('domainguids')) return `Remove linked domains`;
    return `Remove ${tag.replace('Manage ', '').replace('Change ', '')}`;
  }
  
  // Check for empty array patterns (remove operations)
  if (lowerCode.match(/meanings["']?\s*:\s*\[\s*\]/)) return `Remove all linked terms`;
  if (lowerCode.match(/classifications["']?\s*:\s*\[\s*\]/)) return `Remove all tags`;
  if (lowerCode.match(/domainguids["']?\s*:\s*\[\s*\]/)) return `Remove all domains`;
  if (lowerCode.match(/ownerusers["']?\s*:\s*\[\s*\]/) && lowerCode.match(/ownergroups["']?\s*:\s*\[\s*\]/)) return `Clear all owners`;
  
  // Check for create patterns (atlanSchema usually indicates creation)
  if (lowerCode.includes('atlanschema') && !lowerCode.includes(': null')) {
    return `Add when creating asset`;
  }
  
  // Check for specific patterns
  if (lowerCode.includes('{ ... }')) return `With existing terms (append)`;
  if (lowerCode.includes('propagate')) return `With tag propagation settings`;
  if (lowerCode.includes('businessattributes')) return `Set custom metadata`;
  if (lowerCode.includes('userdefrelationship')) return `User-defined relationships`;
  if (lowerCode.includes('inputs') && lowerCode.includes('outputs')) return `Create process lineage`;
  
  // Check for specific asset types
  let assetType = '';
  const typeMatch = code.match(/"typeName"\s*:\s*"([^"]+)"/i);
  if (typeMatch) {
    const typeName = typeMatch[1];
    if (typeName === 'Table') assetType = 'table';
    else if (typeName === 'Column') assetType = 'column';
    else if (typeName === 'AtlasGlossaryTerm') assetType = 'term';
    else if (typeName === 'AtlasGlossary') assetType = 'glossary';
    else if (typeName === 'AtlasGlossaryCategory') assetType = 'category';
    else if (typeName === 'S3Object') assetType = 'S3 object';
    else if (typeName === 'Process') assetType = 'process';
    else if (typeName === 'Link') assetType = 'link';
    else if (typeName === 'Readme') assetType = 'README';
    else if (typeName === 'DataDomain') assetType = 'domain';
    else if (typeName === 'DataProduct') assetType = 'product';
    else if (typeName === 'Persona') assetType = 'persona';
    else if (typeName === 'Purpose') assetType = 'purpose';
    else assetType = typeName.toLowerCase();
  }
  
  // Count how many examples have the same tag to create unique suffixes
  const sameTagExamples = allExamples ? allExamples.filter(e => e.tag === tag) : [];
  const tagIndex = sameTagExamples.findIndex((e, i) => i === sameTagExamples.indexOf(allExamples[idx]));
  
  // Generate summary based on tag and context
  const baseAction = tag
    .replace('Manage ', '')
    .replace('Change ', '')
    .replace(' to assets', '')
    .replace(' assets', '');
  
  if (assetType) {
    // Check if there are other examples with the same asset type
    const suffix = tagIndex > 0 ? ` (${tagIndex + 1})` : '';
    return `${baseAction} on ${assetType}${suffix}`;
  }
  
  // Default: use numbered variants
  return `${baseAction} - example ${idx + 1}`;
}

// Escape for YAML multiline string
function toYamlMultiline(code, indent) {
  const lines = code.split('\n');
  return lines.map(line => `${' '.repeat(indent)}${line}`).join('\n');
}

// Parse JSON with comments stripped
function parseJson(code) {
  try {
    // Strip // comments
    const lines = code.split('\n');
    const cleaned = lines.map(line => {
      let inString = false;
      let result = '';
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const prev = i > 0 ? line[i-1] : '';
        
        if (!inString && (char === '"')) {
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
    
    // Fix trailing commas and placeholders
    const fixed = cleaned
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/\.\.\./g, '"..."');
    
    return JSON.parse(fixed);
  } catch (e) {
    return null;
  }
}

// Convert object to YAML string
function toYaml(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  
  if (obj === null) return 'null';
  if (typeof obj === 'boolean') return obj ? 'true' : 'false';
  if (typeof obj === 'number') return String(obj);
  if (typeof obj === 'string') {
    // Check if needs quoting
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
        // Remove leading indent from first property
        const lines = itemYaml.split('\n');
        if (lines.length > 0) {
          lines[0] = lines[0].trimStart();
        }
        return `${pad}  - ${lines.join('\n')}`;
      }
      return `${pad}  - ${toYaml(item, 0)}`;
    });
    return '\n' + items.join('\n');
  }
  
  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    
    const lines = entries.map(([key, val]) => {
      // Quote key if needed
      const safeKey = /[:\s#{}[\],&*?|<>=!%@`]/.test(key) ? `"${key}"` : key;
      
      if (typeof val === 'object' && val !== null) {
        const valYaml = toYaml(val, indent + 1);
        if (Array.isArray(val)) {
          // For empty arrays, inline on same line
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
    });
    
    return lines.join('\n');
  }
  
  return String(obj);
}

// Generate examples section
function generateExamples(examples, startIndent = 10) {
  const pad = ' '.repeat(startIndent);
  const lines = [];
  
  // Track used keys and ensure uniqueness
  const usedKeys = new Set();
  
  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i];
    let key = makeKey(ex.tag, i);
    
    // Ensure unique
    while (usedKeys.has(key)) {
      key = key + '_' + Math.random().toString(36).substr(2, 4);
    }
    usedKeys.add(key);
    
    // Generate descriptive summary
    const summary = generateSummary(ex.tag, ex.code, i, examples);
    
    lines.push(`${pad}${key}:`);
    lines.push(`${pad}  summary: "${summary}"`);
    lines.push(`${pad}  x-useCaseTag: "${ex.tag}"`);
    lines.push(`${pad}  x-docUrl: ${ex.pageUrl}`);
    lines.push(`${pad}  x-atlanSnippet: |-`);
    
    // Add code
    ex.code.split('\n').forEach(codeLine => {
      lines.push(`${pad}    ${codeLine}`);
    });
    
    // Add parsed value if possible
    const parsed = parseJson(ex.code);
    if (parsed) {
      lines.push(`${pad}  value:`);
      const valueYaml = toYaml(parsed, 7);
      lines.push(valueYaml);
    }
    
    lines.push('');  // blank line between examples
  }
  
  return lines.join('\n');
}

// Collect all unique tags for the tags array
const allTags = [...new Set(postExamples.map(ex => ex.tag))];

// Generate the YAML content
const yaml = `post:
  operationId: createOrUpdateAssets
  summary: Create or update assets in bulk
  description: |
    Bulk upsert of metadata assets. This endpoint underpins most common asset operations.
    
    **Important:** If the \`qualifiedName\` of an entity does not exactly match an existing asset,
    the call will create a new asset even if you intended to update.
    
    For all operations on existing assets, you must provide:
    - **typeName**: Exact type name (case-sensitive)
    - **name**: Exact name (case-sensitive)  
    - **qualifiedName**: Exact qualifiedName (case-sensitive)
    
    This endpoint supports:
    - Creating new assets
    - Updating existing assets
    - Managing metadata (descriptions, certificates, owners, tags, custom metadata)
    - Linking glossary terms and domains
    - Managing READMEs and resources
    - Creating lineage relationships
    
    See examples below for each operation type. Full documentation:
    - [Common examples](https://developer.atlan.com/snippets/common-examples/)
    - [Advanced examples](https://developer.atlan.com/snippets/advanced-examples/)
  externalDocs:
    url: https://developer.atlan.com/snippets/advanced-examples/create/
    description: Creating an asset – Raw REST API examples
  tags:
${allTags.map(t => `    - "${t}"`).join('\n')}
  security:
    - AtlanToken: []
  parameters:
    - $ref: '../../components/parameters/_index.yaml#/replaceTags'
    - $ref: '../../components/parameters/_index.yaml#/appendTags'
    - $ref: '../../components/parameters/_index.yaml#/replaceBusinessAttributes'
    - $ref: '../../components/parameters/_index.yaml#/overwriteBusinessAttributes'
  requestBody:
    required: true
    content:
      application/json:
        schema:
          $ref: '../../components/schemas/AssetMutation.yaml#/AssetMutationRequest'
        examples:
${generateExamples(postExamples)}
  responses:
    '200':
      description: Bulk mutation result
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/AssetMutation.yaml#/AssetMutationResponse'
    '400':
      description: Invalid payload or validation error
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
    '403':
      description: Caller lacks permissions to mutate one or more assets
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'
    '500':
      description: Internal error while mutating assets
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/ErrorResponse.yaml'

delete:
  operationId: deleteAssets
  summary: Delete assets in bulk
  description: |
    Soft-delete or permanently purge assets by GUID.

    **Soft delete** (default): Assets are marked as \`DELETED\` and can be restored.
    **Hard delete**: Assets are permanently removed and cannot be restored.

    ## Use cases
    - [Delete assets](https://developer.atlan.com/snippets/advanced-examples/delete/)
    - [Manage lineage](https://developer.atlan.com/snippets/common-examples/lineage/manage/)
  externalDocs:
    url: https://developer.atlan.com/snippets/advanced-examples/delete/
    description: Deleting an asset – Raw REST API examples
  tags:
    - "Delete assets"
    - "Lineage – Manage"
  security:
    - AtlanToken: []
  parameters:
    - name: guid
      in: query
      required: true
      schema:
        type: array
        items:
          type: string
          format: uuid
      style: form
      explode: true
      description: GUIDs of assets to delete.
    - $ref: '../../components/parameters/_index.yaml#/deleteType'
  responses:
    '200':
      description: Deletion result
      content:
        application/json:
          schema:
            $ref: '../../components/schemas/AssetMutation.yaml#/AssetMutationResponse'
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
    '403':
      description: Caller lacks permissions
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

// Write output
const outputPath = path.join(PROJECT_ROOT, 'openapi/paths/meta/entity-bulk.yaml');
fs.writeFileSync(outputPath, yaml);
console.log(`\nWrote ${outputPath}`);
console.log(`Total POST examples: ${postExamples.length}`);
console.log(`Total DELETE examples: ${deleteExamples.length}`);
console.log(`Unique tags: ${allTags.length}`);
