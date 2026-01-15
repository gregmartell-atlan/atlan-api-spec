#!/usr/bin/env node
/**
 * Add response examples to all use case YAML files
 * Generates realistic response examples based on the request patterns
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USE_CASES_DIR = join(__dirname, '../openapi/use-cases');

// Response templates based on endpoint patterns
const RESPONSE_TEMPLATES = {
  // Entity bulk - create/update
  'POST /api/meta/entity/bulk': (request, context) => {
    const entities = request?.entities || [];
    const isCreate = context.stepTitle?.toLowerCase().includes('creat') || 
                     context.description?.toLowerCase().includes('creat');
    const isDelete = context.stepTitle?.toLowerCase().includes('delet') ||
                     context.stepTitle?.toLowerCase().includes('remov');
    
    const action = isCreate ? 'CREATE' : isDelete ? 'DELETE' : 'UPDATE';
    
    return {
      mutatedEntities: {
        [action]: entities.map((entity, idx) => ({
          typeName: entity.typeName || 'Asset',
          attributes: {
            qualifiedName: entity.attributes?.qualifiedName || `example/asset/${idx}`,
            name: entity.attributes?.name || `Asset ${idx}`,
            ...(entity.attributes?.description && { description: entity.attributes.description }),
            ...(entity.attributes?.certificateStatus && { certificateStatus: entity.attributes.certificateStatus }),
            ...(entity.attributes?.ownerUsers && { ownerUsers: entity.attributes.ownerUsers }),
            ...(entity.attributes?.ownerGroups && { ownerGroups: entity.attributes.ownerGroups }),
            ...(entity.attributes?.announcementType && { 
              announcementType: entity.attributes.announcementType,
              announcementTitle: entity.attributes.announcementTitle,
              announcementMessage: entity.attributes.announcementMessage
            }),
            ...(entity.attributes?.domainGUIDs && { domainGUIDs: entity.attributes.domainGUIDs }),
          },
          guid: generateGuid(idx),
          status: action === 'DELETE' ? 'DELETED' : 'ACTIVE',
          ...(entity.classifications && { classifications: entity.classifications }),
          ...(entity.businessAttributes && { businessAttributes: entity.businessAttributes }),
          ...(entity.attributes?.meanings && {
            relationshipAttributes: {
              meanings: entity.attributes.meanings.map(m => ({
                guid: m.guid,
                typeName: m.typeName || 'AtlasGlossaryTerm',
                displayText: 'Term'
              }))
            }
          }),
          ...(entity.attributes?.anchor && {
            relationshipAttributes: {
              anchor: {
                guid: entity.attributes.anchor.guid || entity.attributes.anchor.uniqueAttributes?.qualifiedName,
                typeName: entity.attributes.anchor.typeName
              }
            }
          })
        }))
      },
      ...(isCreate && {
        guidAssignments: entities.reduce((acc, _, idx) => {
          acc[`-${1234567890 + idx}`] = generateGuid(idx);
          return acc;
        }, {})
      })
    };
  },

  // Entity bulk DELETE
  'DELETE /api/meta/entity/bulk': (request, context) => {
    const isPurge = context.queryString?.includes('PURGE') || 
                    context.stepTitle?.toLowerCase().includes('hard') ||
                    context.stepTitle?.toLowerCase().includes('purge');
    return {
      mutatedEntities: {
        [isPurge ? 'PURGE' : 'DELETE']: [
          {
            typeName: 'Asset',
            attributes: {
              qualifiedName: 'example/deleted/asset',
              name: 'Deleted Asset'
            },
            guid: 'b4113341-251b-4adc-81fb-2420501c30e6',
            status: isPurge ? 'PURGED' : 'DELETED'
          }
        ]
      }
    };
  },

  // Search
  'POST /api/meta/search/indexsearch': (request, context) => {
    const typeName = extractTypeFromQuery(request) || 'Table';
    return {
      queryType: 'INDEX',
      searchParameters: {
        showSearchScore: false,
        suppressLogs: true,
        excludeMeanings: request?.excludeMeanings ?? false,
        excludeClassifications: request?.excludeClassifications ?? false,
        allowDeletedRelations: false,
        query: JSON.stringify(request?.dsl?.query || {}),
        ...(request?.attributes && { attributes: request.attributes })
      },
      approximateCount: 25,
      entities: [
        {
          typeName,
          attributes: {
            qualifiedName: `default/snowflake/1698696666/ANALYTICS/PUBLIC/${typeName.toUpperCase()}_1`,
            name: `${typeName}_1`,
            ...(request?.attributes?.includes('certificateStatus') && { certificateStatus: 'VERIFIED' }),
            ...(request?.attributes?.includes('description') && { description: 'Example description' })
          },
          guid: generateGuid(0),
          status: 'ACTIVE',
          displayText: `${typeName}_1`
        },
        {
          typeName,
          attributes: {
            qualifiedName: `default/snowflake/1698696666/ANALYTICS/PUBLIC/${typeName.toUpperCase()}_2`,
            name: `${typeName}_2`
          },
          guid: generateGuid(1),
          status: 'ACTIVE',
          displayText: `${typeName}_2`
        }
      ]
    };
  },

  // Lineage
  'POST /api/meta/lineage/list': (request, context) => {
    const direction = request?.direction || 'OUTPUT';
    return {
      searchParameters: {
        guid: request?.guid || '495b1516-aaaf-4390-8cfd-b11ade7a7799',
        depth: request?.depth || 1000000,
        direction,
        from: request?.from || 0,
        size: request?.size || 10
      },
      approximateCount: 3,
      entities: [
        {
          typeName: 'Process',
          attributes: {
            qualifiedName: `default/snowflake/lineage/process_${direction.toLowerCase()}`,
            name: `ETL_${direction}_PROCESS`
          },
          guid: generateGuid(0),
          status: 'ACTIVE'
        },
        {
          typeName: 'Table',
          attributes: {
            qualifiedName: `default/snowflake/1698696666/DW/${direction === 'OUTPUT' ? 'GOLD' : 'BRONZE'}/TARGET_TABLE`,
            name: 'TARGET_TABLE',
            __hasLineage: true
          },
          guid: generateGuid(1),
          status: 'ACTIVE'
        }
      ],
      hasMore: false
    };
  },

  // Audit search
  'POST /api/meta/entity/auditSearch': (request, context) => {
    return {
      count: 15,
      entityAudits: [
        {
          entityId: 'b4113341-251b-4adc-81fb-2420501c30e6',
          typeName: 'Table',
          action: 'ENTITY_UPDATE',
          user: 'data.steward@company.com',
          timestamp: Date.now(),
          created: Date.now(),
          detail: {
            typeName: 'Table',
            attributes: {
              certificateStatus: 'VERIFIED'
            },
            guid: 'b4113341-251b-4adc-81fb-2420501c30e6'
          },
          eventKey: `b4113341-251b-4adc-81fb-2420501c30e6:${Date.now()}`
        },
        {
          entityId: 'b4113341-251b-4adc-81fb-2420501c30e6',
          typeName: 'Table',
          action: 'ENTITY_CREATE',
          user: 'service-account-crawler',
          timestamp: Date.now() - 86400000,
          created: Date.now() - 86400000,
          detail: {
            typeName: 'Table',
            attributes: {
              qualifiedName: 'default/snowflake/1698696666/ANALYTICS/PUBLIC/CUSTOMERS',
              name: 'CUSTOMERS'
            },
            guid: 'b4113341-251b-4adc-81fb-2420501c30e6'
          }
        }
      ]
    };
  },

  // Workflow search
  'POST /api/service/workflows/indexsearch': (request, context) => {
    return {
      approximateCount: 5,
      records: [
        {
          _index: 'atlan-workflow',
          _source: {
            metadata: {
              name: 'atlan-snowflake-miner-1714638976',
              namespace: 'default',
              creationTimestamp: new Date().toISOString(),
              labels: {
                'workflows.argoproj.io/creator': 'admin'
              },
              annotations: {
                'package.argoproj.io/name': '@atlan/snowflake-miner'
              }
            },
            spec: {
              entrypoint: 'main'
            },
            status: {
              phase: 'Succeeded',
              startedAt: new Date(Date.now() - 3600000).toISOString(),
              finishedAt: new Date().toISOString()
            }
          }
        }
      ]
    };
  },

  // Workflow runs search
  'POST /api/service/runs/indexsearch': (request, context) => {
    return {
      approximateCount: 10,
      records: [
        {
          _index: 'atlan-workflowrun',
          _source: {
            metadata: {
              name: 'atlan-snowflake-miner-1714638976-run-1',
              namespace: 'default',
              creationTimestamp: new Date().toISOString()
            },
            status: {
              phase: 'Succeeded',
              startedAt: new Date(Date.now() - 3600000).toISOString(),
              finishedAt: new Date().toISOString(),
              progress: '5/5'
            }
          }
        }
      ]
    };
  },

  // Get entity by GUID
  'GET /api/meta/entity/guid': (request, context) => {
    return {
      referredEntities: {},
      entity: {
        typeName: 'Table',
        attributes: {
          qualifiedName: 'default/snowflake/1698696666/ANALYTICS/PUBLIC/CUSTOMERS',
          name: 'CUSTOMERS',
          description: 'Customer master data table',
          certificateStatus: 'VERIFIED',
          ownerUsers: ['data.steward@company.com'],
          connectionQualifiedName: 'default/snowflake/1698696666',
          connectorName: 'snowflake',
          databaseName: 'ANALYTICS',
          schemaName: 'PUBLIC',
          columnCount: 15,
          __hasLineage: true
        },
        guid: 'b4113341-251b-4adc-81fb-2420501c30e6',
        status: 'ACTIVE',
        createdBy: 'service-account-crawler',
        createTime: Date.now() - 86400000 * 30,
        updateTime: Date.now()
      }
    };
  },

  // Get entity by qualifiedName
  'GET /api/meta/entity/uniqueAttribute': (request, context) => {
    return {
      referredEntities: {},
      entity: {
        typeName: 'Table',
        attributes: {
          qualifiedName: 'default/snowflake/1698696666/ANALYTICS/PUBLIC/CUSTOMERS',
          name: 'CUSTOMERS',
          description: 'Customer master data table'
        },
        guid: 'b4113341-251b-4adc-81fb-2420501c30e6',
        status: 'ACTIVE'
      }
    };
  },

  // TypeDefs
  'GET /api/meta/types/typedefs': (request, context) => {
    const type = context.queryString?.match(/type=(\w+)/)?.[1];
    if (type === 'classification') {
      return {
        classificationDefs: [
          {
            category: 'CLASSIFICATION',
            guid: '884091b2-4fbc-4c8e-85d1-173ad90547cf',
            name: 'S7qnUqZ5mBMBpzQ3Wzt6yD',
            displayName: 'PII',
            description: 'Personally Identifiable Information',
            options: { color: 'Red', iconType: 'icon', icon: 'PhPassword' }
          }
        ]
      };
    }
    if (type === 'business_metadata' || type === 'businessMetadata') {
      return {
        businessMetadataDefs: [
          {
            name: 'MNJ8mpLsIOaP4OQnLNhRta',
            displayName: 'Data Quality',
            attributeDefs: [
              { name: 'fWMB77RSjRGNYoFeD4FcGi', displayName: 'Data Steward', typeName: 'string' }
            ]
          }
        ]
      };
    }
    return {
      classificationDefs: [],
      businessMetadataDefs: [],
      enumDefs: [],
      entityDefs: [],
      relationshipDefs: []
    };
  },

  // Business metadata update
  'POST /api/meta/entity/guid': (request, context) => {
    if (context.endpoint?.includes('businessmetadata')) {
      return {
        mutatedEntities: {
          UPDATE: [
            {
              typeName: 'Table',
              attributes: {
                qualifiedName: 'default/snowflake/1657037873/SAMPLE_DB/FOOD_BEV/TOP_BEVERAGE_USERS',
                name: 'TOP_BEVERAGE_USERS'
              },
              businessAttributes: request,
              guid: 'a89ff15b-f5e6-48bc-870b-acfa11e212ae',
              status: 'ACTIVE'
            }
          ]
        }
      };
    }
    return null;
  },

  // Credentials
  'POST /api/service/credentials': (request, context) => {
    return {
      id: '972a87c1-28d7-8bf2-896d-ea5bd3e9c691',
      name: request?.name || 'credential-name',
      host: request?.host || 'example.host.com',
      port: request?.port || 443,
      authType: request?.authType || 'basic',
      connectorConfigName: request?.connectorConfigName || 'atlan-connectors-snowflake',
      isValid: true,
      message: 'Connection successful'
    };
  },

  // Default for unknown endpoints
  'default': (request, context) => null
};

function generateGuid(index) {
  const base = 'abcdef01-2345-6789-abcd-ef';
  return `${base}${String(index).padStart(12, '0')}`;
}

function extractTypeFromQuery(request) {
  const query = request?.dsl?.query;
  if (!query) return null;
  
  const queryStr = JSON.stringify(query);
  const typeMatch = queryStr.match(/__typeName[^}]*value[^}]*"(\w+)"/);
  if (typeMatch) return typeMatch[1];
  
  return null;
}

function getEndpointKey(method, endpoint) {
  // Normalize endpoint for matching
  const normalizedEndpoint = endpoint
    ?.replace(/\/[a-f0-9-]{36}/g, '') // Remove GUIDs
    ?.replace(/\?.*$/, '') // Remove query string
    ?.replace(/\/+$/, ''); // Remove trailing slashes
  
  const key = `${method} ${normalizedEndpoint}`;
  
  // Try exact match first
  if (RESPONSE_TEMPLATES[key]) return key;
  
  // Try prefix matches
  for (const templateKey of Object.keys(RESPONSE_TEMPLATES)) {
    const [tMethod, tEndpoint] = templateKey.split(' ');
    if (method === tMethod && normalizedEndpoint?.startsWith(tEndpoint)) {
      return templateKey;
    }
  }
  
  return 'default';
}

function generateResponse(method, endpoint, request, context) {
  const key = getEndpointKey(method, endpoint);
  const generator = RESPONSE_TEMPLATES[key];
  
  if (!generator) return null;
  
  try {
    return generator(request, context);
  } catch (e) {
    console.warn(`Error generating response for ${key}:`, e.message);
    return null;
  }
}

function processExample(example, step) {
  // Skip if already has response
  if (example.response) return false;
  
  // Skip if no method/endpoint
  if (!step.method || !step.endpoint) return false;
  
  // Skip DELETE without request body (response is generated from context)
  const request = example.request || (example.requestRaw ? tryParseJson(example.requestRaw) : null);
  
  const context = {
    stepTitle: step.title,
    description: step.description,
    endpoint: step.endpoint,
    queryString: step.queryString
  };
  
  const response = generateResponse(step.method, step.endpoint, request, context);
  
  if (response) {
    example.response = response;
    return true;
  }
  
  return false;
}

function tryParseJson(str) {
  try {
    // Clean up common issues in raw JSON
    const cleaned = str
      .replace(/\/\/[^\n]*/g, '') // Remove comments
      .replace(/,\s*}/g, '}') // Remove trailing commas
      .replace(/,\s*]/g, ']');
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function processUseCase(useCase) {
  let modified = false;
  
  if (!useCase.steps) return false;
  
  for (const step of useCase.steps) {
    if (!step.examples) continue;
    
    for (const example of step.examples) {
      if (processExample(example, step)) {
        modified = true;
      }
    }
  }
  
  return modified;
}

function processFile(filepath) {
  try {
    const content = readFileSync(filepath, 'utf8');
    const useCase = yaml.load(content);
    
    if (!useCase || !useCase.id) return { path: filepath, modified: false, error: 'Invalid use case' };
    
    const modified = processUseCase(useCase);
    
    if (modified) {
      const newContent = yaml.dump(useCase, {
        lineWidth: -1,
        noRefs: true,
        quotingType: '"',
        forceQuotes: false
      });
      writeFileSync(filepath, newContent);
    }
    
    return { path: filepath, modified, id: useCase.id };
  } catch (e) {
    return { path: filepath, modified: false, error: e.message };
  }
}

function scanDirectory(dirPath) {
  const results = [];
  
  const entries = readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.name.startsWith('_')) continue;
    
    const fullPath = join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      results.push(...scanDirectory(fullPath));
    } else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) {
      results.push(processFile(fullPath));
    }
  }
  
  return results;
}

// Main execution
console.log('Adding response examples to use cases...\n');

const results = scanDirectory(USE_CASES_DIR);

const modified = results.filter(r => r.modified);
const errors = results.filter(r => r.error);
const unchanged = results.filter(r => !r.modified && !r.error);

console.log(`Results:`);
console.log(`  Modified: ${modified.length} files`);
console.log(`  Unchanged: ${unchanged.length} files`);
console.log(`  Errors: ${errors.length} files`);

if (modified.length > 0) {
  console.log('\nModified files:');
  for (const r of modified) {
    console.log(`  ✓ ${r.id}`);
  }
}

if (errors.length > 0) {
  console.log('\nErrors:');
  for (const r of errors) {
    console.log(`  ✗ ${r.path}: ${r.error}`);
  }
}

console.log('\nDone! Run "npm run bundle:use-cases" to update the bundled JSON.');
