/**
 * Discovery Agent
 * 
 * Discovers assets and governance objects to populate the context store.
 * Uses FQN seeds and API searches to build a comprehensive test context.
 */

import { loadFqnsFromCSV, classifyFqns, printSummary } from '../lib/fqn-loader.mjs';
import { ATTRIBUTE_SETS } from '../config/endpoint-chains.mjs';

export class DiscoveryAgent {
  constructor(atlanClient, contextStore, responseStore) {
    this.client = atlanClient;
    this.contextStore = contextStore;
    this.responseStore = responseStore;
    
    // Discovery stats
    this.stats = {
      fqnsLoaded: 0,
      fqnsResolved: 0,
      fqnsFailed: 0,
      assetsDiscovered: 0,
      classificationsDiscovered: 0,
      customMetadataDiscovered: 0,
      domainsDiscovered: 0,
      termsDiscovered: 0
    };
  }

  /**
   * Run full discovery process
   */
  async discoverAll(options = {}) {
    console.log('\n🔍 Starting Discovery Agent...\n');
    
    // Step 1: Discover governance objects first (needed for context)
    await this.discoverGovernanceObjects();
    
    // Step 2: Load and resolve FQNs if provided
    if (options.fqnCsvPath) {
      await this.discoverFromCsv(options.fqnCsvPath, options);
    }
    
    // Step 3: Discover additional assets via search
    if (options.searchDiscovery !== false) {
      await this.discoverViaSearch(options);
    }
    
    console.log('\n✅ Discovery complete!\n');
    this.printSummary();
    
    return this.getReport();
  }

  /**
   * Discover governance objects (classifications, custom metadata, enums)
   */
  async discoverGovernanceObjects() {
    console.log('📌 Discovering governance objects...');
    
    // Classifications
    try {
      console.log('   ├─ Classifications...');
      const classResponse = await this.client.getClassificationDefs();
      const classificationDefs = classResponse.data?.classificationDefs || [];
      this.contextStore.addClassifications(classificationDefs);
      this.stats.classificationsDiscovered = classificationDefs.length;
      console.log(`   │  Found ${classificationDefs.length} classifications`);
      
      this.storeResponse('GET', '/api/meta/types/typedefs?type=classification', classResponse, 'discover-classifications');
    } catch (error) {
      console.log(`   │  ⚠️ Failed to get classifications: ${error.message}`);
    }
    
    // Custom Metadata (Business Metadata)
    try {
      console.log('   ├─ Custom metadata...');
      const bmResponse = await this.client.getBusinessMetadataDefs();
      const businessMetadataDefs = bmResponse.data?.businessMetadataDefs || [];
      this.contextStore.addCustomMetadata(businessMetadataDefs);
      this.stats.customMetadataDiscovered = businessMetadataDefs.length;
      console.log(`   │  Found ${businessMetadataDefs.length} custom metadata types`);
      
      this.storeResponse('GET', '/api/meta/types/typedefs?type=businessMetadata', bmResponse, 'discover-custom-metadata');
    } catch (error) {
      console.log(`   │  ⚠️ Failed to get custom metadata: ${error.message}`);
    }
    
    // Enums (for badges, etc.)
    try {
      console.log('   ├─ Enums...');
      const enumResponse = await this.client.getEnumDefs();
      const enumDefs = enumResponse.data?.enumDefs || [];
      this.contextStore.addEnums(enumDefs);
      console.log(`   │  Found ${enumDefs.length} enums`);
      
      this.storeResponse('GET', '/api/meta/types/typedefs?type=enum', enumResponse, 'discover-enums');
    } catch (error) {
      console.log(`   │  ⚠️ Failed to get enums: ${error.message}`);
    }
    
    console.log('   └─ Done');
  }

  /**
   * Discover assets from a CSV file of FQNs
   */
  async discoverFromCsv(csvPath, options = {}) {
    console.log(`\n📂 Loading FQNs from CSV: ${csvPath}`);
    
    // Load and classify FQNs
    const fqns = loadFqnsFromCSV(csvPath);
    const result = classifyFqns(fqns);
    this.stats.fqnsLoaded = fqns.length;
    
    printSummary(result);
    
    // Resolve FQNs in batches
    const batchSize = options.batchSize || 20;
    const allFqns = fqns.map(f => f.qualifiedName);
    
    console.log(`\n🔗 Resolving ${allFqns.length} FQNs to GUIDs...`);
    
    for (let i = 0; i < allFqns.length; i += batchSize) {
      const batch = allFqns.slice(i, i + batchSize);
      const progress = `[${Math.min(i + batchSize, allFqns.length)}/${allFqns.length}]`;
      
      try {
        process.stdout.write(`   ├─ Batch ${progress}...`);
        const response = await this.client.searchByFqns(batch, {
          attributes: ATTRIBUTE_SETS.full
        });
        
        const entities = response.data?.entities || [];
        this.stats.fqnsResolved += entities.length;
        this.stats.assetsDiscovered += entities.length;
        
        // Add to context store
        for (const entity of entities) {
          this.contextStore.addAsset(entity);
        }
        
        console.log(` ✅ Resolved ${entities.length}/${batch.length}`);
        
        // Store the response
        this.storeResponse('POST', '/api/meta/search/indexsearch', response, 'resolve-fqns');
        
        // Small delay to avoid rate limiting
        if (i + batchSize < allFqns.length) {
          await this.sleep(100);
        }
        
      } catch (error) {
        console.log(` ❌ Failed: ${error.message}`);
        this.stats.fqnsFailed += batch.length;
      }
    }
    
    console.log(`   └─ Resolved ${this.stats.fqnsResolved} of ${allFqns.length} FQNs`);
  }

  /**
   * Discover additional assets via targeted searches
   */
  async discoverViaSearch(options = {}) {
    console.log('\n🔎 Discovering assets via search...');
    
    // Find assets with classifications
    try {
      console.log('   ├─ Assets with classifications...');
      const response = await this.client.search({
        query: {
          bool: {
            must: [{ exists: { field: '__classificationNames' } }]
          }
        },
        size: options.sampleSize || 50
      }, { attributes: ATTRIBUTE_SETS.standard });
      
      const entities = response.data?.entities || [];
      console.log(`   │  Found ${entities.length} assets with classifications`);
      
      for (const entity of entities) {
        this.contextStore.addAsset(entity);
      }
      
      this.storeResponse('POST', '/api/meta/search/indexsearch', response, 'discover-classified-assets');
    } catch (error) {
      console.log(`   │  ⚠️ Failed: ${error.message}`);
    }
    
    // Find assets with lineage
    try {
      console.log('   ├─ Assets with lineage...');
      const response = await this.client.search({
        query: {
          bool: {
            must: [{ term: { '__hasLineage': true } }]
          }
        },
        size: options.sampleSize || 50
      }, { attributes: ATTRIBUTE_SETS.minimal });
      
      const entities = response.data?.entities || [];
      console.log(`   │  Found ${entities.length} assets with lineage`);
      
      for (const entity of entities) {
        this.contextStore.addAsset(entity);
      }
      
      this.storeResponse('POST', '/api/meta/search/indexsearch', response, 'discover-lineage-assets');
    } catch (error) {
      console.log(`   │  ⚠️ Failed: ${error.message}`);
    }
    
    // Find domains
    try {
      console.log('   ├─ Data domains...');
      const response = await this.client.search({
        query: {
          term: { '__typeName.keyword': 'DataDomain' }
        },
        size: 100
      }, { attributes: ATTRIBUTE_SETS.standard });
      
      const entities = response.data?.entities || [];
      this.contextStore.addDomains(entities);
      this.stats.domainsDiscovered = entities.length;
      console.log(`   │  Found ${entities.length} domains`);
      
      this.storeResponse('POST', '/api/meta/search/indexsearch', response, 'discover-domains');
    } catch (error) {
      console.log(`   │  ⚠️ Failed: ${error.message}`);
    }
    
    // Find glossary terms
    try {
      console.log('   ├─ Glossary terms...');
      const response = await this.client.search({
        query: {
          term: { '__typeName.keyword': 'AtlasGlossaryTerm' }
        },
        size: 100
      }, { attributes: ATTRIBUTE_SETS.standard });
      
      const entities = response.data?.entities || [];
      this.contextStore.addTerms(entities);
      this.stats.termsDiscovered = entities.length;
      console.log(`   │  Found ${entities.length} terms`);
      
      this.storeResponse('POST', '/api/meta/search/indexsearch', response, 'discover-terms');
    } catch (error) {
      console.log(`   │  ⚠️ Failed: ${error.message}`);
    }
    
    console.log('   └─ Done');
  }

  /**
   * Store a response in the response store
   */
  storeResponse(method, path, response, useCase) {
    this.responseStore.addResponse({
      method,
      path,
      status: response.status,
      responseBody: response.data,
      useCase,
      chainStep: useCase
    });
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get discovery report
   */
  getReport() {
    return {
      timestamp: new Date().toISOString(),
      stats: this.stats,
      contextStats: this.contextStore.getStats()
    };
  }

  /**
   * Print discovery summary
   */
  printSummary() {
    console.log('\n=== Discovery Summary ===\n');
    console.log(`FQNs loaded: ${this.stats.fqnsLoaded}`);
    console.log(`FQNs resolved: ${this.stats.fqnsResolved}`);
    console.log(`FQNs failed: ${this.stats.fqnsFailed}`);
    console.log(`\nTotal assets in context: ${this.contextStore.guids.size}`);
    console.log(`Classifications discovered: ${this.stats.classificationsDiscovered}`);
    console.log(`Custom metadata types: ${this.stats.customMetadataDiscovered}`);
    console.log(`Domains: ${this.stats.domainsDiscovered}`);
    console.log(`Terms: ${this.stats.termsDiscovered}`);
    
    // Type breakdown
    const typeStats = this.contextStore.getStats().typeBreakdown;
    if (Object.keys(typeStats).length > 0) {
      console.log('\nAssets by type:');
      for (const [type, count] of Object.entries(typeStats).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${type}: ${count}`);
      }
    }
  }
}

export default DiscoveryAgent;
