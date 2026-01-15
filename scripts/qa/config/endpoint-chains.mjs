/**
 * Endpoint Chain Definitions
 * 
 * Defines sequences of API calls that should be executed together,
 * with each call potentially using values from previous responses.
 */

/**
 * Common attributes to request for different asset types
 */
export const ATTRIBUTE_SETS = {
  minimal: ['guid', 'qualifiedName', 'name', 'typeName'],
  
  standard: [
    'guid', 'qualifiedName', 'name', 'typeName',
    'description', 'userDescription', 'displayName',
    'certificateStatus', 'certificateStatusMessage',
    'ownerUsers', 'ownerGroups',
    'classifications', 'classificationNames',
    'meanings', 'meaningNames',
    '__hasLineage'
  ],
  
  full: [
    'guid', 'qualifiedName', 'name', 'typeName',
    'description', 'userDescription', 'displayName',
    'certificateStatus', 'certificateStatusMessage',
    'announcementType', 'announcementTitle', 'announcementMessage',
    'ownerUsers', 'ownerGroups', 'adminUsers', 'adminGroups',
    'classifications', 'classificationNames',
    'businessAttributes',
    'meanings', 'meaningNames',
    '__hasLineage',
    'createTime', 'updateTime', 'createdBy', 'updatedBy',
    'connectorName', 'connectionName', 'connectionQualifiedName',
    'databaseName', 'databaseQualifiedName',
    'schemaName', 'schemaQualifiedName',
    'tableName', 'tableQualifiedName',
    'domainGUIDs'
  ],
  
  table: [
    'guid', 'qualifiedName', 'name', 'typeName',
    'description', 'userDescription', 'displayName',
    'columnCount', 'rowCount', 'sizeBytes',
    'isPartitioned', 'partitionCount',
    'queryCount', 'queryUserCount',
    'isProfiled', 'lastProfiledAt',
    'atlanSchema', 'columns'
  ],
  
  column: [
    'guid', 'qualifiedName', 'name', 'typeName',
    'description', 'userDescription',
    'dataType', 'order', 'isPrimary', 'isNullable',
    'maxLength', 'precision', 'numericScale',
    'table'
  ]
};

/**
 * Endpoint chain definitions
 * 
 * Each chain is a sequence of API calls with:
 * - name: Identifier for the chain
 * - description: What this chain tests
 * - requires: What context values are needed
 * - steps: Ordered API calls
 */
export const ENDPOINT_CHAINS = [
  // ============================================================
  // DISCOVERY CHAINS - Populate context
  // ============================================================
  {
    name: 'discover-governance',
    description: 'Discover all governance objects (classifications, custom metadata, enums)',
    category: 'discovery',
    steps: [
      {
        name: 'get-classification-defs',
        endpoint: 'GET /api/meta/types/typedefs',
        queryParams: { type: 'classification' },
        extractors: ['classificationDefs']
      },
      {
        name: 'get-business-metadata-defs',
        endpoint: 'GET /api/meta/types/typedefs',
        queryParams: { type: 'businessMetadata' },
        extractors: ['businessMetadataDefs']
      },
      {
        name: 'get-enum-defs',
        endpoint: 'GET /api/meta/types/typedefs',
        queryParams: { type: 'enum' },
        extractors: ['enumDefs']
      }
    ]
  },

  {
    name: 'discover-domains',
    description: 'Discover all data domains',
    category: 'discovery',
    steps: [
      {
        name: 'search-domains',
        endpoint: 'POST /api/meta/search/indexsearch',
        body: {
          dsl: {
            query: {
              term: { '__typeName.keyword': 'DataDomain' }
            },
            size: 100
          },
          attributes: ATTRIBUTE_SETS.standard
        },
        extractors: ['domains']
      }
    ]
  },

  {
    name: 'discover-terms',
    description: 'Discover glossary terms',
    category: 'discovery',
    steps: [
      {
        name: 'search-terms',
        endpoint: 'POST /api/meta/search/indexsearch',
        body: {
          dsl: {
            query: {
              term: { '__typeName.keyword': 'AtlasGlossaryTerm' }
            },
            size: 100
          },
          attributes: ATTRIBUTE_SETS.standard
        },
        extractors: ['terms']
      }
    ]
  },

  // ============================================================
  // ASSET RETRIEVAL CHAINS
  // ============================================================
  {
    name: 'resolve-fqn-to-guid',
    description: 'Resolve FQNs to GUIDs via search',
    category: 'resolution',
    requires: ['fqns'],
    steps: [
      {
        name: 'search-by-fqn',
        endpoint: 'POST /api/meta/search/indexsearch',
        body: {
          dsl: {
            query: {
              term: { 'qualifiedName': '{fqn}' }
            },
            size: 1
          },
          attributes: ATTRIBUTE_SETS.full
        },
        forEach: 'fqns',
        extractors: ['entities']
      }
    ]
  },

  {
    name: 'get-full-entity',
    description: 'Get full entity details by GUID',
    category: 'entity',
    requires: ['guid'],
    steps: [
      {
        name: 'get-by-guid',
        endpoint: 'GET /api/meta/entity/guid/{guid}',
        pathParams: { guid: '{guid}' },
        queryParams: { minExtInfo: false, ignoreRelationships: false },
        extractors: ['entity', 'referredEntities']
      }
    ]
  },

  {
    name: 'get-entity-by-unique-attribute',
    description: 'Get entity by qualifiedName',
    category: 'entity',
    requires: ['typeName', 'qualifiedName'],
    steps: [
      {
        name: 'get-by-qualified-name',
        endpoint: 'GET /api/meta/entity/uniqueAttribute/type/{typeName}',
        pathParams: { typeName: '{typeName}' },
        queryParams: { 
          'attr:qualifiedName': '{qualifiedName}',
          minExtInfo: false
        },
        extractors: ['entity']
      }
    ]
  },

  // ============================================================
  // CLASSIFICATION CHAINS
  // ============================================================
  {
    name: 'classification-read-operations',
    description: 'Test classification read operations',
    category: 'classification',
    requires: ['guid'],
    steps: [
      {
        name: 'get-entity-classifications',
        endpoint: 'GET /api/meta/entity/guid/{guid}/classifications',
        pathParams: { guid: '{guid}' },
        extractors: ['classifications']
      }
    ]
  },

  {
    name: 'classification-write-operations',
    description: 'Test classification write operations (add/remove)',
    category: 'classification',
    requires: ['guid', 'classificationName'],
    isDestructive: true,
    steps: [
      {
        name: 'add-classification',
        endpoint: 'POST /api/meta/entity/bulk',
        queryParams: { appendTags: true },
        body: {
          entities: [{
            guid: '{guid}',
            typeName: '{typeName}',
            attributes: {
              qualifiedName: '{qualifiedName}'
            },
            classifications: [{
              typeName: '{classificationName}'
            }]
          }]
        }
      },
      {
        name: 'verify-classification-added',
        endpoint: 'GET /api/meta/entity/guid/{guid}/classifications',
        pathParams: { guid: '{guid}' }
      },
      {
        name: 'remove-classification',
        endpoint: 'DELETE /api/meta/entity/guid/{guid}/classification/{classificationName}',
        pathParams: { 
          guid: '{guid}', 
          classificationName: '{classificationName}' 
        }
      }
    ]
  },

  // ============================================================
  // CUSTOM METADATA CHAINS
  // ============================================================
  {
    name: 'custom-metadata-read-operations',
    description: 'Test custom metadata read operations',
    category: 'customMetadata',
    requires: ['guid'],
    steps: [
      {
        name: 'get-entity-with-business-attributes',
        endpoint: 'GET /api/meta/entity/guid/{guid}',
        pathParams: { guid: '{guid}' },
        extractors: ['businessAttributes']
      }
    ]
  },

  // ============================================================
  // LINEAGE CHAINS
  // ============================================================
  {
    name: 'lineage-operations',
    description: 'Test lineage retrieval operations',
    category: 'lineage',
    requires: ['guid'],
    steps: [
      {
        name: 'get-lineage-list-input',
        endpoint: 'POST /api/meta/lineage/list',
        body: {
          guid: '{guid}',
          depth: 1,
          direction: 'INPUT',
          size: 10,
          from: 0
        }
      },
      {
        name: 'get-lineage-list-output',
        endpoint: 'POST /api/meta/lineage/list',
        body: {
          guid: '{guid}',
          depth: 1,
          direction: 'OUTPUT',
          size: 10,
          from: 0
        }
      }
    ]
  },

  // ============================================================
  // AUDIT CHAINS
  // ============================================================
  {
    name: 'audit-operations',
    description: 'Test audit history retrieval',
    category: 'audit',
    requires: ['guid'],
    steps: [
      {
        name: 'get-entity-audit',
        endpoint: 'POST /api/meta/entity/auditSearch',
        body: {
          dsl: {
            query: {
              term: { entityId: '{guid}' }
            },
            size: 10,
            sort: [{ timestamp: { order: 'desc' } }]
          }
        }
      }
    ]
  },

  // ============================================================
  // SEARCH CHAINS
  // ============================================================
  {
    name: 'search-operations',
    description: 'Test various search patterns',
    category: 'search',
    steps: [
      {
        name: 'search-tables',
        endpoint: 'POST /api/meta/search/indexsearch',
        body: {
          dsl: {
            query: {
              bool: {
                must: [
                  { term: { '__typeName.keyword': 'Table' } }
                ]
              }
            },
            size: 10
          },
          attributes: ATTRIBUTE_SETS.table
        }
      },
      {
        name: 'search-with-classifications',
        endpoint: 'POST /api/meta/search/indexsearch',
        body: {
          dsl: {
            query: {
              bool: {
                must: [
                  { exists: { field: '__classificationNames' } }
                ]
              }
            },
            size: 10
          },
          attributes: ATTRIBUTE_SETS.standard
        }
      },
      {
        name: 'search-with-lineage',
        endpoint: 'POST /api/meta/search/indexsearch',
        body: {
          dsl: {
            query: {
              bool: {
                must: [
                  { term: { '__hasLineage': true } }
                ]
              }
            },
            size: 10
          },
          attributes: ATTRIBUTE_SETS.minimal
        }
      },
      {
        name: 'search-with-terms',
        endpoint: 'POST /api/meta/search/indexsearch',
        body: {
          dsl: {
            query: {
              bool: {
                must: [
                  { exists: { field: '__meanings' } }
                ]
              }
            },
            size: 10
          },
          attributes: ATTRIBUTE_SETS.standard
        }
      }
    ]
  },

  // ============================================================
  // WORKFLOW CHAINS
  // ============================================================
  {
    name: 'workflow-operations',
    description: 'Test workflow search operations',
    category: 'workflow',
    steps: [
      {
        name: 'search-workflows',
        endpoint: 'POST /api/service/workflows/indexsearch',
        body: {
          from: 0,
          size: 10,
          query: {
            bool: {
              filter: []
            }
          }
        }
      },
      {
        name: 'search-workflow-runs',
        endpoint: 'POST /api/service/runs/indexsearch',
        body: {
          from: 0,
          size: 10,
          query: {
            bool: {
              filter: []
            }
          },
          sort: [{ 'metadata.creationTimestamp': { order: 'desc' } }]
        }
      }
    ]
  },

  // ============================================================
  // TYPE DEFINITION CHAINS
  // ============================================================
  {
    name: 'typedef-operations',
    description: 'Test type definition retrieval',
    category: 'types',
    steps: [
      // Skip get-all-typedefs - it's very slow (can take 3+ minutes)
      {
        name: 'get-classification-typedefs',
        endpoint: 'GET /api/meta/types/typedefs',
        queryParams: { type: 'classification' }
      },
      {
        name: 'get-business-metadata-typedefs',
        endpoint: 'GET /api/meta/types/typedefs',
        queryParams: { type: 'businessMetadata' }
      },
      {
        name: 'get-enum-typedefs',
        endpoint: 'GET /api/meta/types/typedefs',
        queryParams: { type: 'enum' }
      }
    ]
  },

  // ============================================================
  // COMPLETE ASSET LIFECYCLE CHAIN
  // ============================================================
  {
    name: 'full-asset-inspection',
    description: 'Complete inspection of an asset with all related data',
    category: 'comprehensive',
    requires: ['guid'],
    steps: [
      {
        name: 'get-full-entity',
        endpoint: 'GET /api/meta/entity/guid/{guid}',
        pathParams: { guid: '{guid}' },
        queryParams: { minExtInfo: false, ignoreRelationships: false }
      },
      {
        name: 'get-classifications',
        endpoint: 'GET /api/meta/entity/guid/{guid}/classifications',
        pathParams: { guid: '{guid}' }
      },
      {
        name: 'get-audit-history',
        endpoint: 'POST /api/meta/entity/auditSearch',
        body: {
          dsl: {
            query: { term: { entityId: '{guid}' } },
            size: 5,
            sort: [{ timestamp: { order: 'desc' } }]
          }
        }
      },
      {
        name: 'get-lineage-input',
        endpoint: 'POST /api/meta/lineage/list',
        body: {
          guid: '{guid}',
          depth: 1,
          direction: 'INPUT',
          size: 10,
          from: 0
        }
      },
      {
        name: 'get-lineage-output',
        endpoint: 'POST /api/meta/lineage/list',
        body: {
          guid: '{guid}',
          depth: 1,
          direction: 'OUTPUT',
          size: 10,
          from: 0
        }
      }
    ]
  },

  // ============================================================
  // TABLE-SPECIFIC CHAIN
  // ============================================================
  {
    name: 'table-full-inspection',
    description: 'Complete inspection of a table with columns and relationships',
    category: 'comprehensive',
    requires: ['tableGuid'],
    assetType: 'Table',
    steps: [
      {
        name: 'get-table',
        endpoint: 'GET /api/meta/entity/guid/{guid}',
        pathParams: { guid: '{tableGuid}' },
        queryParams: { minExtInfo: false, ignoreRelationships: false }
      },
      {
        name: 'get-table-classifications',
        endpoint: 'GET /api/meta/entity/guid/{guid}/classifications',
        pathParams: { guid: '{tableGuid}' }
      },
      {
        name: 'search-table-columns',
        endpoint: 'POST /api/meta/search/indexsearch',
        body: {
          dsl: {
            query: {
              term: { 'tableQualifiedName': '{tableQualifiedName}' }
            },
            size: 100
          },
          attributes: ATTRIBUTE_SETS.column
        }
      },
      {
        name: 'get-table-lineage-input',
        endpoint: 'POST /api/meta/lineage/list',
        body: {
          guid: '{tableGuid}',
          depth: 2,
          direction: 'INPUT',
          size: 10,
          from: 0
        }
      },
      {
        name: 'get-table-lineage-output',
        endpoint: 'POST /api/meta/lineage/list',
        body: {
          guid: '{tableGuid}',
          depth: 2,
          direction: 'OUTPUT',
          size: 10,
          from: 0
        }
      }
    ]
  }
];

/**
 * Get chains by category
 */
export function getChainsByCategory(category) {
  return ENDPOINT_CHAINS.filter(chain => chain.category === category);
}

/**
 * Get chain by name
 */
export function getChainByName(name) {
  return ENDPOINT_CHAINS.find(chain => chain.name === name);
}

/**
 * Get all non-destructive chains
 */
export function getSafeChains() {
  return ENDPOINT_CHAINS.filter(chain => !chain.isDestructive);
}

/**
 * Get chains that can run without any context (discovery chains)
 */
export function getDiscoveryChains() {
  return ENDPOINT_CHAINS.filter(chain => !chain.requires || chain.requires.length === 0);
}

export default {
  ENDPOINT_CHAINS,
  ATTRIBUTE_SETS,
  getChainsByCategory,
  getChainByName,
  getSafeChains,
  getDiscoveryChains
};
