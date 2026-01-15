/**
 * Context Store
 * 
 * Manages discovered values for chaining API calls.
 * Stores GUIDs, FQNs, classifications, custom metadata, and other
 * governance objects discovered during QA execution.
 */

import fs from 'fs';
import path from 'path';

export class ContextStore {
  constructor() {
    // Asset identifiers
    this.guids = new Map();  // guid -> { typeName, qualifiedName, name, source }
    this.fqns = new Map();   // qualifiedName -> { typeName, guid, name, source }
    
    // Governance objects
    this.classifications = new Map();    // displayName -> { name (hashed), ... }
    this.customMetadata = new Map();     // name -> { attributeDefs, ... }
    this.enums = new Map();              // name -> { elementDefs, ... }
    this.domains = new Map();            // guid -> { name, qualifiedName, ... }
    this.terms = new Map();              // guid -> { name, qualifiedName, ... }
    
    // Asset type index for targeted testing
    this.assetsByType = new Map();       // typeName -> Set of guids
    
    // Relationship tracking
    this.relationships = new Map();      // guid -> { classifications: [], meanings: [], ... }
    
    // Statistics
    this.stats = {
      totalAssets: 0,
      assetsWithClassifications: 0,
      assetsWithCustomMetadata: 0,
      assetsWithLineage: 0,
      assetsWithTerms: 0
    };
  }

  // ============================================================
  // ASSET MANAGEMENT
  // ============================================================

  /**
   * Add an asset to the store
   */
  addAsset(entity) {
    const guid = entity.guid;
    const qualifiedName = entity.attributes?.qualifiedName || entity.qualifiedName;
    const typeName = entity.typeName;
    const name = entity.attributes?.name || entity.name;
    
    if (!guid || !qualifiedName || !typeName) {
      console.warn('Incomplete entity data, skipping:', { guid, qualifiedName, typeName });
      return;
    }

    // Store by GUID
    this.guids.set(guid, {
      typeName,
      qualifiedName,
      name,
      source: 'discovery'
    });

    // Store by FQN
    this.fqns.set(qualifiedName, {
      typeName,
      guid,
      name,
      source: 'discovery'
    });

    // Index by type
    if (!this.assetsByType.has(typeName)) {
      this.assetsByType.set(typeName, new Set());
    }
    this.assetsByType.get(typeName).add(guid);

    // Track relationships
    const relationships = {
      classifications: [],
      customMetadata: {},
      meanings: [],
      hasLineage: false
    };

    // Classifications
    if (entity.classifications?.length > 0 || entity.classificationNames?.length > 0) {
      relationships.classifications = entity.classifications || [];
      this.stats.assetsWithClassifications++;
    }

    // Custom metadata (business attributes)
    if (entity.businessAttributes && Object.keys(entity.businessAttributes).length > 0) {
      relationships.customMetadata = entity.businessAttributes;
      this.stats.assetsWithCustomMetadata++;
    }

    // Terms (meanings)
    if (entity.meanings?.length > 0) {
      relationships.meanings = entity.meanings;
      this.stats.assetsWithTerms++;
    }

    // Lineage
    if (entity.__hasLineage || entity.attributes?.__hasLineage) {
      relationships.hasLineage = true;
      this.stats.assetsWithLineage++;
    }

    this.relationships.set(guid, relationships);
    this.stats.totalAssets++;
  }

  /**
   * Add multiple assets from a search response
   */
  addFromSearchResponse(response) {
    const entities = response.data?.entities || [];
    for (const entity of entities) {
      this.addAsset(entity);
    }
    return entities.length;
  }

  /**
   * Add from GET entity response
   */
  addFromEntityResponse(response) {
    const entity = response.data?.entity;
    if (entity) {
      this.addAsset(entity);
      return 1;
    }
    return 0;
  }

  // ============================================================
  // GOVERNANCE OBJECT MANAGEMENT
  // ============================================================

  /**
   * Add classifications from typedefs response
   */
  addClassifications(classificationDefs) {
    for (const def of classificationDefs || []) {
      this.classifications.set(def.displayName || def.name, {
        name: def.name,           // Hashed string
        displayName: def.displayName,
        description: def.description,
        attributeDefs: def.attributeDefs || []
      });
    }
  }

  /**
   * Add custom metadata from typedefs response
   */
  addCustomMetadata(businessMetadataDefs) {
    for (const def of businessMetadataDefs || []) {
      this.customMetadata.set(def.name, {
        name: def.name,
        displayName: def.displayName,
        description: def.description,
        attributeDefs: def.attributeDefs || []
      });
    }
  }

  /**
   * Add enums from typedefs response
   */
  addEnums(enumDefs) {
    for (const def of enumDefs || []) {
      this.enums.set(def.name, {
        name: def.name,
        elementDefs: def.elementDefs || []
      });
    }
  }

  /**
   * Add domains from search response
   */
  addDomains(entities) {
    for (const entity of entities || []) {
      if (entity.typeName === 'DataDomain') {
        this.domains.set(entity.guid, {
          guid: entity.guid,
          name: entity.attributes?.name || entity.name,
          qualifiedName: entity.attributes?.qualifiedName || entity.qualifiedName
        });
      }
    }
  }

  /**
   * Add terms from search response
   */
  addTerms(entities) {
    for (const entity of entities || []) {
      if (entity.typeName === 'AtlasGlossaryTerm') {
        this.terms.set(entity.guid, {
          guid: entity.guid,
          name: entity.attributes?.name || entity.name,
          qualifiedName: entity.attributes?.qualifiedName || entity.qualifiedName
        });
      }
    }
  }

  // ============================================================
  // QUERYING
  // ============================================================

  /**
   * Get a GUID for a given FQN
   */
  getGuidForFqn(qualifiedName) {
    return this.fqns.get(qualifiedName)?.guid;
  }

  /**
   * Get FQN for a given GUID
   */
  getFqnForGuid(guid) {
    return this.guids.get(guid)?.qualifiedName;
  }

  /**
   * Get type name for a GUID
   */
  getTypeForGuid(guid) {
    return this.guids.get(guid)?.typeName;
  }

  /**
   * Get all GUIDs of a specific type
   */
  getGuidsByType(typeName) {
    return Array.from(this.assetsByType.get(typeName) || []);
  }

  /**
   * Get assets with classifications
   */
  getAssetsWithClassifications() {
    const results = [];
    for (const [guid, rels] of this.relationships) {
      if (rels.classifications.length > 0) {
        results.push({ guid, ...this.guids.get(guid), classifications: rels.classifications });
      }
    }
    return results;
  }

  /**
   * Get assets with custom metadata
   */
  getAssetsWithCustomMetadata() {
    const results = [];
    for (const [guid, rels] of this.relationships) {
      if (Object.keys(rels.customMetadata).length > 0) {
        results.push({ guid, ...this.guids.get(guid), customMetadata: rels.customMetadata });
      }
    }
    return results;
  }

  /**
   * Get assets with lineage
   */
  getAssetsWithLineage() {
    const results = [];
    for (const [guid, rels] of this.relationships) {
      if (rels.hasLineage) {
        results.push({ guid, ...this.guids.get(guid) });
      }
    }
    return results;
  }

  /**
   * Get a random sample of GUIDs for testing
   */
  getSampleGuids(count = 5, options = {}) {
    let candidates = Array.from(this.guids.keys());
    
    // Filter by type if specified
    if (options.typeName) {
      const typeGuids = this.assetsByType.get(options.typeName);
      if (typeGuids) {
        candidates = Array.from(typeGuids);
      } else {
        return [];
      }
    }
    
    // Filter by having classifications
    if (options.hasClassifications) {
      candidates = candidates.filter(guid => {
        const rels = this.relationships.get(guid);
        return rels && rels.classifications.length > 0;
      });
    }
    
    // Filter by having lineage
    if (options.hasLineage) {
      candidates = candidates.filter(guid => {
        const rels = this.relationships.get(guid);
        return rels && rels.hasLineage;
      });
    }
    
    // Shuffle and take sample
    const shuffled = candidates.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  /**
   * Get classification name (hashed) by display name
   */
  getClassificationName(displayName) {
    return this.classifications.get(displayName)?.name;
  }

  /**
   * Get test context for a specific chain
   */
  getTestContext(chainName) {
    const context = {
      guids: this.getSampleGuids(3),
      fqns: Array.from(this.fqns.keys()).slice(0, 3),
      classifications: Array.from(this.classifications.keys()),
      customMetadata: Array.from(this.customMetadata.keys()),
      domains: Array.from(this.domains.values()),
      terms: Array.from(this.terms.values())
    };
    
    // Add type-specific samples
    context.tables = this.getGuidsByType('Table').slice(0, 3);
    context.columns = this.getGuidsByType('Column').slice(0, 3);
    context.schemas = this.getGuidsByType('Schema').slice(0, 3);
    context.views = this.getGuidsByType('View').slice(0, 3);
    
    return context;
  }

  // ============================================================
  // STATISTICS
  // ============================================================

  /**
   * Get summary statistics
   */
  getStats() {
    return {
      ...this.stats,
      uniqueTypes: this.assetsByType.size,
      typeBreakdown: Object.fromEntries(
        Array.from(this.assetsByType.entries()).map(([type, guids]) => [type, guids.size])
      ),
      classificationCount: this.classifications.size,
      customMetadataCount: this.customMetadata.size,
      enumCount: this.enums.size,
      domainCount: this.domains.size,
      termCount: this.terms.size
    };
  }

  // ============================================================
  // PERSISTENCE
  // ============================================================

  /**
   * Export context to a file
   */
  export(filePath) {
    const data = {
      timestamp: new Date().toISOString(),
      guids: Object.fromEntries(this.guids),
      fqns: Object.fromEntries(this.fqns),
      classifications: Object.fromEntries(this.classifications),
      customMetadata: Object.fromEntries(this.customMetadata),
      enums: Object.fromEntries(this.enums),
      domains: Object.fromEntries(this.domains),
      terms: Object.fromEntries(this.terms),
      assetsByType: Object.fromEntries(
        Array.from(this.assetsByType.entries()).map(([k, v]) => [k, Array.from(v)])
      ),
      relationships: Object.fromEntries(this.relationships),
      stats: this.stats
    };
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Context exported to ${filePath}`);
  }

  /**
   * Import context from a file
   */
  import(filePath) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    this.guids = new Map(Object.entries(data.guids || {}));
    this.fqns = new Map(Object.entries(data.fqns || {}));
    this.classifications = new Map(Object.entries(data.classifications || {}));
    this.customMetadata = new Map(Object.entries(data.customMetadata || {}));
    this.enums = new Map(Object.entries(data.enums || {}));
    this.domains = new Map(Object.entries(data.domains || {}));
    this.terms = new Map(Object.entries(data.terms || {}));
    this.assetsByType = new Map(
      Object.entries(data.assetsByType || {}).map(([k, v]) => [k, new Set(v)])
    );
    this.relationships = new Map(Object.entries(data.relationships || {}));
    this.stats = data.stats || this.stats;
    
    console.log(`Context imported from ${filePath}`);
    console.log(`Loaded ${this.guids.size} assets`);
  }
}

export default ContextStore;
