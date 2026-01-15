/**
 * Type mappings configuration for documentation enhancement
 * 
 * Maps endpoints, categories, and file patterns to related entity types
 */

// Endpoint patterns to related types
export const ENDPOINT_TYPE_MAPPINGS = [
  // Type definitions (tags, custom metadata, enums)
  { pattern: /\/api\/meta\/types\/typedefs.*classification/i, types: ['ClassificationDef'] },
  { pattern: /\/api\/meta\/types\/typedefs.*business/i, types: ['BusinessMetadataDef'] },
  { pattern: /\/api\/meta\/types\/typedef/i, types: ['ClassificationDef', 'BusinessMetadataDef'] },
  
  // Entity operations
  { pattern: /\/api\/meta\/entity\/bulk/i, types: ['Asset'] },
  { pattern: /\/api\/meta\/entity\/guid/i, types: ['Asset'] },
  { pattern: /\/api\/meta\/entity\/uniqueAttribute/i, types: ['Asset'] },
  
  // Glossary
  { pattern: /\/api\/meta\/glossary\/term/i, types: ['AtlasGlossaryTerm'] },
  { pattern: /\/api\/meta\/glossary\/category/i, types: ['AtlasGlossaryCategory'] },
  { pattern: /\/api\/meta\/glossary/i, types: ['AtlasGlossary', 'AtlasGlossaryTerm', 'AtlasGlossaryCategory'] },
  
  // Search
  { pattern: /\/api\/meta\/search/i, types: ['Asset'] },
  { pattern: /\/api\/search/i, types: ['Asset'] },
  
  // Lineage
  { pattern: /\/api\/meta\/lineage/i, types: ['ColumnProcess', 'Process'] },
  { pattern: /\/api\/lineage/i, types: ['ColumnProcess', 'Process'] },
  
  // Tasks
  { pattern: /\/api\/meta\/task/i, types: ['Task'] },
  
  // Workflows
  { pattern: /\/api\/workflow/i, types: ['Workflow', 'WorkflowRun'] },
  { pattern: /\/workflow/i, types: ['Workflow', 'WorkflowRun'] },
  
  // Access control
  { pattern: /\/api\/service\/personas/i, types: ['Persona', 'AuthPolicy'] },
  { pattern: /\/api\/service\/purposes/i, types: ['Purpose', 'AuthPolicy'] },
  { pattern: /\/api\/service\/policies/i, types: ['AuthPolicy'] },
  { pattern: /\/api\/service\/accesscontrol/i, types: ['Persona', 'Purpose', 'AuthPolicy'] },
  
  // Users and groups
  { pattern: /\/api\/service\/users/i, types: [] }, // No entity type for users
  { pattern: /\/api\/service\/groups/i, types: [] }, // No entity type for groups
  
  // API tokens
  { pattern: /\/api\/service\/apikeys/i, types: [] },
  
  // Files
  { pattern: /\/api\/service\/files/i, types: ['File'] },
  
  // Data contracts
  { pattern: /\/api\/meta\/contract/i, types: ['DataContract'] },
];

// Category to related types mapping
export const CATEGORY_TYPE_MAPPINGS = {
  'governance': {
    'tags': ['ClassificationDef', 'Tag', 'SourceTagAttachment', 'SnowflakeTag', 'DbtTag', 'BigqueryTag', 'DatabricksUnityCatalogTag'],
    'custom-metadata': ['BusinessMetadataDef'],
    'default': ['ClassificationDef', 'BusinessMetadataDef'],
  },
  'common-actions': {
    'tags': ['ClassificationDef', 'SourceTagAttachment'],
    'glossary': ['AtlasGlossary', 'AtlasGlossaryTerm', 'AtlasGlossaryCategory'],
    'term': ['AtlasGlossaryTerm', 'AtlasGlossary'],
    'domain': ['DataDomain'],
    'lineage': ['ColumnProcess', 'Process'],
    'readme': ['Readme'],
    'resources': ['Link', 'File'],
    'profiling': ['Table', 'Column'],
    'default': ['Asset'],
  },
  'data-mesh': {
    'domain': ['DataDomain'],
    'product': ['DataProduct'],
    'default': ['DataDomain', 'DataProduct'],
  },
  'data-contracts': {
    'default': ['DataContract'],
  },
  'access-control': {
    'personas': ['Persona', 'AuthPolicy'],
    'purposes': ['Purpose', 'AuthPolicy'],
    'policies': ['AuthPolicy'],
    'tokens': [],
    'users': [],
    'groups': [],
    'default': ['Persona', 'Purpose', 'AuthPolicy'],
  },
  'workflows': {
    'default': ['Workflow', 'WorkflowRun'],
  },
  'crud': {
    'default': ['Asset'],
  },
  'search': {
    'default': ['Asset'],
  },
  'lineage': {
    'default': ['ColumnProcess', 'Process'],
  },
  'asset-specific': {
    'files': ['File'],
    'default': ['Asset'],
  },
  'glossary': {
    'default': ['AtlasGlossary', 'AtlasGlossaryTerm', 'AtlasGlossaryCategory'],
  },
};

// File name patterns to additional types
export const FILENAME_TYPE_MAPPINGS = [
  { pattern: /announcement/i, types: ['Asset'] },
  { pattern: /certificate/i, types: ['Asset'] },
  { pattern: /description/i, types: ['Asset'] },
  { pattern: /owner/i, types: ['Asset'] },
  { pattern: /glossary/i, types: ['AtlasGlossary', 'AtlasGlossaryTerm', 'AtlasGlossaryCategory'] },
  { pattern: /term/i, types: ['AtlasGlossaryTerm'] },
  { pattern: /category/i, types: ['AtlasGlossaryCategory'] },
  { pattern: /tag/i, types: ['ClassificationDef'] },
  { pattern: /custom-metadata/i, types: ['BusinessMetadataDef'] },
  { pattern: /lineage/i, types: ['ColumnProcess', 'Process'] },
  { pattern: /domain/i, types: ['DataDomain'] },
  { pattern: /product/i, types: ['DataProduct'] },
  { pattern: /contract/i, types: ['DataContract'] },
  { pattern: /readme/i, types: ['Readme'] },
  { pattern: /persona/i, types: ['Persona', 'AuthPolicy'] },
  { pattern: /purpose/i, types: ['Purpose', 'AuthPolicy'] },
  { pattern: /policy/i, types: ['AuthPolicy'] },
  { pattern: /workflow/i, types: ['Workflow', 'WorkflowRun'] },
  { pattern: /badge/i, types: ['Badge'] },
  { pattern: /link/i, types: ['Link'] },
  { pattern: /file/i, types: ['File'] },
];

// Models that may need to be created if not already present
// These are now created manually, so this is kept as reference
export const MISSING_MODELS = {
  // All models have been created - this object is kept for reference
  // businessmetadatadef, process, classificationdef, sourcetagattachment are now in public/models/
};

// Known existing models (verified in public/models/)
export const KNOWN_EXISTING_MODELS = [
  'asset', 'table', 'column', 'database', 'schema', 'view',
  'atlasglossary', 'atlasglossaryterm', 'atlasglossarycategory',
  'tag', 'tagattachment', 'snowflaketag', 'dbttag', 'bigquerytag', 'databricksunitycatalogtag',
  'classificationdef', 'sourcetagattachment',
  'datadomain', 'dataproduct', 'datacontract',
  'persona', 'purpose', 'authpolicy',
  'workflow', 'workflowrun',
  'columnprocess', 'biprocess',
  'readme', 'link', 'file', 'badge',
  'connection', 'query', 'procedure', 'function',
  'task',
  // ... many more from scraped models
];

export default {
  ENDPOINT_TYPE_MAPPINGS,
  CATEGORY_TYPE_MAPPINGS,
  FILENAME_TYPE_MAPPINGS,
  MISSING_MODELS,
  KNOWN_EXISTING_MODELS,
};
