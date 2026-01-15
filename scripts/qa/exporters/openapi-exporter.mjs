/**
 * OpenAPI Exporter
 * 
 * Exports captured responses as OpenAPI examples, schemas, and integrates them
 * with the existing OpenAPI specification.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// SCHEMA INFERENCE
// ============================================================================

/**
 * Infer JSON Schema from a value
 */
function inferSchema(value, options = {}) {
  const { 
    maxArraySamples = 10,
    includeExamples = true,
    depth = 0,
    maxDepth = 8
  } = options;

  if (value === null || value === undefined) {
    return { type: 'null' };
  }

  if (depth > maxDepth) {
    return { type: 'object', additionalProperties: true };
  }

  const type = Array.isArray(value) ? 'array' : typeof value;

  switch (type) {
    case 'string':
      return inferStringSchema(value, includeExamples);
    
    case 'number':
      return inferNumberSchema(value, includeExamples);
    
    case 'boolean':
      return { type: 'boolean' };
    
    case 'array':
      return inferArraySchema(value, { ...options, depth: depth + 1 });
    
    case 'object':
      return inferObjectSchema(value, { ...options, depth: depth + 1 });
    
    default:
      return {};
  }
}

/**
 * Infer schema for string values
 */
function inferStringSchema(value, includeExamples) {
  const schema = { type: 'string' };

  // Detect common formats
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    schema.format = 'uuid';
    schema.description = 'Unique identifier (GUID)';
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    schema.format = 'date-time';
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    schema.format = 'date';
  } else if (/^https?:\/\//.test(value)) {
    schema.format = 'uri';
  } else if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) {
    schema.format = 'email';
  }

  // Detect qualified names
  if (value.includes('/') && value.split('/').length >= 3) {
    schema.description = 'Fully qualified name (FQN)';
  }

  if (includeExamples && value.length < 200) {
    schema.example = value;
  }

  return schema;
}

/**
 * Infer schema for number values
 */
function inferNumberSchema(value, includeExamples) {
  const schema = { type: Number.isInteger(value) ? 'integer' : 'number' };

  // Detect timestamps (milliseconds since epoch)
  if (Number.isInteger(value) && value > 1000000000000 && value < 2000000000000) {
    schema.format = 'int64';
    schema.description = 'Unix timestamp in milliseconds';
  }

  if (includeExamples) {
    schema.example = value;
  }

  return schema;
}

/**
 * Infer schema for array values
 */
function inferArraySchema(arr, options) {
  const schema = { type: 'array' };

  if (arr.length === 0) {
    schema.items = {};
    return schema;
  }

  // Sample items to infer the item schema
  const sampleSize = Math.min(arr.length, options.maxArraySamples || 10);
  const samples = arr.slice(0, sampleSize);

  // Merge schemas from all samples
  const itemSchemas = samples.map(item => inferSchema(item, options));
  schema.items = mergeSchemas(itemSchemas);

  return schema;
}

/**
 * Infer schema for object values
 */
function inferObjectSchema(obj, options) {
  const schema = {
    type: 'object',
    properties: {}
  };

  const required = [];

  for (const [key, value] of Object.entries(obj)) {
    // Skip internal/private fields
    if (key.startsWith('__') && !['__typeName', '__hasLineage', '__state'].includes(key)) {
      continue;
    }

    schema.properties[key] = inferSchema(value, options);

    // Add descriptions for common Atlan fields
    addFieldDescription(schema.properties[key], key, value);

    // Track which fields appear (for required analysis)
    if (value !== null && value !== undefined) {
      required.push(key);
    }
  }

  // Only mark fields as required if we're confident
  if (required.length > 0 && required.length <= 5) {
    schema.required = required;
  }

  return schema;
}

/**
 * Add descriptions for common Atlan API fields
 */
function addFieldDescription(schema, key, value) {
  const fieldDescriptions = {
    guid: 'Unique identifier for the entity',
    qualifiedName: 'Fully qualified name that uniquely identifies the asset',
    typeName: 'The type of the entity (e.g., Table, Column, Database)',
    displayName: 'Human-readable display name',
    name: 'Name of the entity',
    description: 'Description of the entity',
    userDescription: 'User-provided description',
    ownerUsers: 'List of users who own this asset',
    ownerGroups: 'List of groups that own this asset',
    certificateStatus: 'Certification status (VERIFIED, DRAFT, DEPRECATED)',
    announcementType: 'Type of announcement (information, warning, issue)',
    announcementTitle: 'Title of the announcement',
    announcementMessage: 'Content of the announcement',
    createTime: 'Timestamp when the entity was created',
    updateTime: 'Timestamp when the entity was last updated',
    createdBy: 'User who created the entity',
    updatedBy: 'User who last updated the entity',
    classifications: 'Classifications (tags) applied to this entity',
    meanings: 'Glossary terms linked to this entity',
    attributes: 'Entity attributes',
    relationshipAttributes: 'Relationship attributes connecting to other entities',
    isIncomplete: 'Whether the entity data is incomplete',
    status: 'Entity status (ACTIVE, DELETED)',
    __typeName: 'Internal type name field',
    __hasLineage: 'Whether the entity has lineage relationships',
    __state: 'Current state of the entity',
    entities: 'Array of entity objects',
    approximateCount: 'Approximate count of matching results',
    searchParameters: 'Parameters used for the search query',
    queryType: 'Type of query executed',
    classificationDefs: 'Classification type definitions',
    entityDefs: 'Entity type definitions',
    enumDefs: 'Enum type definitions',
    businessMetadataDefs: 'Business metadata (custom metadata) definitions',
    structDefs: 'Struct type definitions',
    relationshipDefs: 'Relationship type definitions'
  };

  if (fieldDescriptions[key] && !schema.description) {
    schema.description = fieldDescriptions[key];
  }
}

/**
 * Merge multiple schemas into one (for array item inference)
 */
function mergeSchemas(schemas) {
  if (schemas.length === 0) return {};
  if (schemas.length === 1) return schemas[0];

  // Check if all schemas have the same type
  const types = [...new Set(schemas.map(s => s.type).filter(Boolean))];

  if (types.length === 1) {
    if (types[0] === 'object') {
      // Merge object properties
      const merged = { type: 'object', properties: {} };
      for (const schema of schemas) {
        if (schema.properties) {
          for (const [key, prop] of Object.entries(schema.properties)) {
            if (!merged.properties[key]) {
              merged.properties[key] = prop;
            }
          }
        }
      }
      return merged;
    }
    return schemas[0];
  }

  // Multiple types - use oneOf or just return first
  if (types.length > 1) {
    return { oneOf: schemas.slice(0, 3) };
  }

  return schemas[0];
}

/**
 * Infer schemas from captured responses, grouped by endpoint
 */
export function inferResponseSchemas(responses, options = {}) {
  const schemas = {};

  for (const response of responses) {
    // Only use successful responses
    if (response.status < 200 || response.status >= 300) continue;
    if (!response.responseBody) continue;

    const endpointKey = `${response.method}:${response.path}`;

    if (!schemas[endpointKey]) {
      schemas[endpointKey] = {
        method: response.method,
        path: response.path,
        statusCode: response.status,
        requestSchema: null,
        responseSchema: null,
        samples: []
      };
    }

    // Infer request schema
    if (response.requestBody && !schemas[endpointKey].requestSchema) {
      schemas[endpointKey].requestSchema = inferSchema(response.requestBody, options);
    }

    // Collect samples for response schema (we'll merge later)
    schemas[endpointKey].samples.push(response.responseBody);
  }

  // Now infer response schemas from collected samples
  for (const [key, data] of Object.entries(schemas)) {
    if (data.samples.length > 0) {
      // Use first sample for main schema, merge properties from others
      const sampleSchemas = data.samples.slice(0, 5).map(s => inferSchema(s, options));
      data.responseSchema = mergeSchemas(sampleSchemas);
    }
    delete data.samples; // Clean up
  }

  return schemas;
}

/**
 * Generate OpenAPI-compatible schema definitions
 */
export function generateOpenAPISchemas(responses, options = {}) {
  const schemas = inferResponseSchemas(responses, options);
  const openAPISchemas = {};

  for (const [endpointKey, data] of Object.entries(schemas)) {
    // Create a schema name from the endpoint
    const schemaName = endpointKey
      .replace(/^(GET|POST|PUT|PATCH|DELETE):/, '')
      .replace(/^\/api\//, '')
      .replace(/\//g, '_')
      .replace(/[{}?=&]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');

    openAPISchemas[endpointKey] = {
      endpoint: endpointKey,
      method: data.method,
      path: data.path,
      schemas: {
        request: data.requestSchema ? {
          name: `${schemaName}Request`,
          schema: data.requestSchema
        } : null,
        response: data.responseSchema ? {
          name: `${schemaName}Response`,
          schema: data.responseSchema
        } : null
      }
    };
  }

  return openAPISchemas;
}

/**
 * Export schemas to a components/schemas format
 */
export function exportSchemasToComponents(responses, outputPath) {
  const schemas = generateOpenAPISchemas(responses);

  const components = {
    schemas: {}
  };

  for (const [endpointKey, data] of Object.entries(schemas)) {
    if (data.schemas.request) {
      components.schemas[data.schemas.request.name] = data.schemas.request.schema;
    }
    if (data.schemas.response) {
      components.schemas[data.schemas.response.name] = data.schemas.response.schema;
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(components, null, 2));
  console.log(`Schemas exported to ${outputPath}`);

  return components;
}

// ============================================================================
// COMBINED EXPORT (Examples + Schemas)
// ============================================================================

/**
 * Generate complete OpenAPI documentation with examples AND schemas
 */
export function generateCompleteOpenAPIDocs(responses, options = {}) {
  const result = {};

  for (const response of responses) {
    if (response.status < 200 || response.status >= 300) continue;

    const endpointKey = `${response.method}:${response.path}`;

    if (!result[endpointKey]) {
      result[endpointKey] = {
        method: response.method,
        path: response.path,
        requestSchema: null,
        responseSchema: null,
        requestExamples: {},
        responseExamples: {}
      };
    }

    const entry = result[endpointKey];
    const exampleKey = `${response.useCase}_${Object.keys(entry.responseExamples).length}`;

    // Infer schemas from first response
    if (!entry.responseSchema && response.responseBody) {
      entry.responseSchema = inferSchema(response.responseBody, { 
        includeExamples: false,
        maxDepth: 6 
      });
    }

    if (!entry.requestSchema && response.requestBody) {
      entry.requestSchema = inferSchema(response.requestBody, { 
        includeExamples: false,
        maxDepth: 6 
      });
    }

    // Add examples
    if (response.requestBody) {
      entry.requestExamples[exampleKey] = {
        summary: `${response.useCase} - Request ${Object.keys(entry.requestExamples).length + 1}`,
        value: cleanRequestBody(response.requestBody)
      };
    }

    if (response.responseBody) {
      entry.responseExamples[exampleKey] = {
        summary: `${response.useCase} - Response ${Object.keys(entry.responseExamples).length + 1}`,
        value: cleanResponseBody(response.responseBody, options)
      };
    }
  }

  return result;
}

/**
 * Convert responses to OpenAPI examples format
 */
export function responsesToOpenAPIExamples(responses, options = {}) {
  const examples = {};
  
  for (const response of responses) {
    // Only include successful responses
    if (response.status < 200 || response.status >= 300) continue;
    
    const endpointKey = `${response.method}:${response.path}`;
    
    if (!examples[endpointKey]) {
      examples[endpointKey] = {
        method: response.method,
        path: response.path,
        requests: [],
        responses: []
      };
    }
    
    // Add request example
    if (response.requestBody) {
      examples[endpointKey].requests.push({
        summary: `${response.useCase} - Request`,
        description: `Request body for ${response.chainStep || response.useCase}`,
        value: cleanRequestBody(response.requestBody),
        'x-use-case': response.useCase,
        'x-chain-step': response.chainStep
      });
    }
    
    // Add response example
    if (response.responseBody) {
      examples[endpointKey].responses.push({
        summary: `${response.useCase} - Response`,
        description: `Response for ${response.chainStep || response.useCase}`,
        value: cleanResponseBody(response.responseBody, options),
        'x-status': response.status,
        'x-use-case': response.useCase,
        'x-chain-step': response.chainStep
      });
    }
  }
  
  return examples;
}

/**
 * Clean request body for documentation
 */
function cleanRequestBody(body) {
  if (!body) return body;
  
  // Deep clone
  const cleaned = JSON.parse(JSON.stringify(body));
  
  // Remove sensitive or dynamic values
  const replaceValues = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(replaceValues);
    }
    
    for (const [key, value] of Object.entries(obj)) {
      // Keep structure but may sanitize certain values
      if (typeof value === 'object') {
        obj[key] = replaceValues(value);
      }
    }
    
    return obj;
  };
  
  return replaceValues(cleaned);
}

/**
 * Clean response body for documentation
 */
function cleanResponseBody(body, options = {}) {
  if (!body) return body;
  
  const maxArrayItems = options.maxArrayItems || 3;
  const maxDepth = options.maxDepth || 5;
  
  const clean = (obj, depth = 0) => {
    if (depth > maxDepth) return '...';
    if (!obj || typeof obj !== 'object') return obj;
    
    if (Array.isArray(obj)) {
      if (obj.length === 0) return [];
      
      // Truncate arrays
      const truncated = obj.slice(0, maxArrayItems).map(item => clean(item, depth + 1));
      if (obj.length > maxArrayItems) {
        truncated.push({ '...': `${obj.length - maxArrayItems} more items` });
      }
      return truncated;
    }
    
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip internal/sensitive fields
      if (key.startsWith('_') && key !== '__hasLineage' && key !== '__typeName') {
        continue;
      }
      
      result[key] = clean(value, depth + 1);
    }
    
    return result;
  };
  
  return clean(JSON.parse(JSON.stringify(body)));
}

/**
 * Generate YAML examples for each endpoint
 */
export function generateYAMLExamples(examples) {
  const yamlSections = {};
  
  for (const [endpoint, data] of Object.entries(examples)) {
    const lines = [];
    
    // Request examples
    if (data.requests.length > 0) {
      lines.push('requestBody:');
      lines.push('  content:');
      lines.push('    application/json:');
      lines.push('      examples:');
      
      // Deduplicate by use case
      const seenUseCases = new Set();
      for (const req of data.requests) {
        if (seenUseCases.has(req['x-use-case'])) continue;
        seenUseCases.add(req['x-use-case']);
        
        const key = req['x-use-case'].replace(/[^a-zA-Z0-9]/g, '_');
        lines.push(`        ${key}:`);
        lines.push(`          summary: "${req.summary}"`);
        lines.push(`          value:`);
        
        const valueYaml = JSON.stringify(req.value, null, 2)
          .split('\n')
          .map(l => `            ${l}`)
          .join('\n');
        lines.push(valueYaml);
      }
    }
    
    // Response examples
    if (data.responses.length > 0) {
      lines.push('responses:');
      lines.push('  200:');
      lines.push('    content:');
      lines.push('      application/json:');
      lines.push('        examples:');
      
      const seenUseCases = new Set();
      for (const res of data.responses) {
        if (seenUseCases.has(res['x-use-case'])) continue;
        seenUseCases.add(res['x-use-case']);
        
        const key = res['x-use-case'].replace(/[^a-zA-Z0-9]/g, '_');
        lines.push(`          ${key}:`);
        lines.push(`            summary: "${res.summary}"`);
        lines.push(`            value:`);
        
        const valueYaml = JSON.stringify(res.value, null, 2)
          .split('\n')
          .map(l => `              ${l}`)
          .join('\n');
        lines.push(valueYaml);
      }
    }
    
    yamlSections[endpoint] = lines.join('\n');
  }
  
  return yamlSections;
}

/**
 * Export examples to files
 */
export function exportExamplesToFiles(examples, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Group by endpoint path
  const byPath = {};
  
  for (const [endpoint, data] of Object.entries(examples)) {
    const pathKey = data.path
      .replace(/^\/api\//, '')
      .replace(/\//g, '-')
      .replace(/[{}]/g, '')
      .replace(/-+/g, '-');
    
    if (!byPath[pathKey]) {
      byPath[pathKey] = [];
    }
    byPath[pathKey].push({ endpoint, ...data });
  }
  
  // Write each endpoint group to a file
  for (const [pathKey, endpoints] of Object.entries(byPath)) {
    const filePath = path.join(outputDir, `${pathKey}-examples.json`);
    fs.writeFileSync(filePath, JSON.stringify(endpoints, null, 2));
    console.log(`  ✓ ${filePath}`);
  }
  
  // Write summary index
  const indexPath = path.join(outputDir, 'examples-index.json');
  const index = Object.entries(examples).map(([endpoint, data]) => ({
    endpoint,
    method: data.method,
    path: data.path,
    requestCount: data.requests.length,
    responseCount: data.responses.length,
    useCases: [...new Set(data.requests.map(r => r['x-use-case']))]
  }));
  
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`  ✓ ${indexPath}`);
  
  return index;
}

/**
 * Generate use-case-centric documentation
 */
export function generateUseCaseDocs(responses, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Group responses by use case
  const byUseCase = {};
  
  for (const response of responses) {
    if (response.status >= 400) continue; // Skip failures
    
    const useCase = response.useCase || 'unknown';
    if (!byUseCase[useCase]) {
      byUseCase[useCase] = {
        name: useCase,
        description: `API calls for ${useCase}`,
        steps: []
      };
    }
    
    byUseCase[useCase].steps.push({
      name: response.chainStep || `Step ${byUseCase[useCase].steps.length + 1}`,
      endpoint: `${response.method} ${response.path}`,
      request: cleanRequestBody(response.requestBody),
      response: {
        status: response.status,
        body: cleanResponseBody(response.responseBody, { maxArrayItems: 2 })
      }
    });
  }
  
  // Write each use case
  for (const [useCase, data] of Object.entries(byUseCase)) {
    const fileName = useCase.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
    const filePath = path.join(outputDir, fileName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }
  
  // Write index
  const indexPath = path.join(outputDir, 'use-case-index.json');
  const index = Object.values(byUseCase).map(uc => ({
    name: uc.name,
    stepCount: uc.steps.length
  }));
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  
  return Object.keys(byUseCase).length;
}

/**
 * Export complete documentation (schemas + examples) to files
 */
export function exportCompleteDocsToFiles(responses, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate complete docs with schemas and examples
  const completeDocs = generateCompleteOpenAPIDocs(responses, { maxArrayItems: 3 });

  // Write the complete documentation
  const completeDocsPath = path.join(outputDir, 'openapi-complete.json');
  fs.writeFileSync(completeDocsPath, JSON.stringify(completeDocs, null, 2));
  console.log(`Complete OpenAPI docs exported to ${completeDocsPath}`);

  // Generate component schemas separately
  const schemasPath = path.join(outputDir, 'openapi-schemas.json');
  const components = exportSchemasToComponents(responses, schemasPath);

  // Generate a YAML-ready format
  const yamlReadyPath = path.join(outputDir, 'openapi-yaml-ready.json');
  const yamlReady = generateYAMLReadyFormat(completeDocs);
  fs.writeFileSync(yamlReadyPath, JSON.stringify(yamlReady, null, 2));
  console.log(`YAML-ready format exported to ${yamlReadyPath}`);

  return {
    completeDocs,
    components,
    yamlReady
  };
}

/**
 * Generate a format that's ready to be converted to YAML
 */
function generateYAMLReadyFormat(completeDocs) {
  const paths = {};

  for (const [endpointKey, data] of Object.entries(completeDocs)) {
    const [method, ...pathParts] = endpointKey.split(':');
    const apiPath = pathParts.join(':'); // Rejoin in case path has colons

    if (!paths[apiPath]) {
      paths[apiPath] = {};
    }

    const operation = {
      summary: `${method} ${apiPath}`,
      operationId: endpointKey
        .replace(/[^a-zA-Z0-9]/g, '_')
        .replace(/_+/g, '_')
        .toLowerCase()
    };

    // Add request body with schema and examples
    if (data.requestSchema || Object.keys(data.requestExamples).length > 0) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {}
        }
      };

      if (data.requestSchema) {
        operation.requestBody.content['application/json'].schema = data.requestSchema;
      }

      if (Object.keys(data.requestExamples).length > 0) {
        operation.requestBody.content['application/json'].examples = data.requestExamples;
      }
    }

    // Add response with schema and examples
    operation.responses = {
      '200': {
        description: 'Successful response',
        content: {
          'application/json': {}
        }
      }
    };

    if (data.responseSchema) {
      operation.responses['200'].content['application/json'].schema = data.responseSchema;
    }

    if (Object.keys(data.responseExamples).length > 0) {
      operation.responses['200'].content['application/json'].examples = data.responseExamples;
    }

    paths[apiPath][method.toLowerCase()] = operation;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Atlan API (Generated)',
      version: '1.0.0',
      description: 'API documentation generated from live API responses'
    },
    paths
  };
}

export default {
  responsesToOpenAPIExamples,
  generateYAMLExamples,
  exportExamplesToFiles,
  generateUseCaseDocs,
  inferSchema,
  inferResponseSchemas,
  generateOpenAPISchemas,
  exportSchemasToComponents,
  generateCompleteOpenAPIDocs,
  exportCompleteDocsToFiles
};
