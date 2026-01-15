/**
 * Executor Agent
 * 
 * Executes endpoint chains using context values and captures responses.
 * Handles variable substitution and chained API calls.
 */

import { ENDPOINT_CHAINS, ATTRIBUTE_SETS } from '../config/endpoint-chains.mjs';

export class ExecutorAgent {
  constructor(atlanClient, contextStore, responseStore) {
    this.client = atlanClient;
    this.contextStore = contextStore;
    this.responseStore = responseStore;
    
    // Execution stats
    this.stats = {
      chainsExecuted: 0,
      stepsExecuted: 0,
      stepsSucceeded: 0,
      stepsFailed: 0,
      stepsSkipped: 0
    };
    
    // Execution log
    this.executionLog = [];
  }

  /**
   * Execute all chains (or a filtered set)
   */
  async executeAllChains(options = {}) {
    const chains = options.chains || ENDPOINT_CHAINS;
    const safeOnly = options.safeOnly ?? true;
    
    const chainsToRun = safeOnly 
      ? chains.filter(c => !c.isDestructive)
      : chains;
    
    console.log(`\n🚀 Executing ${chainsToRun.length} endpoint chains...\n`);
    
    for (const chain of chainsToRun) {
      try {
        await this.executeChain(chain, options);
      } catch (error) {
        console.error(`Chain ${chain.name} failed:`, error.message);
        this.log('chain-error', { chain: chain.name, error: error.message });
      }
    }
    
    return this.getReport();
  }

  /**
   * Execute chains by category
   */
  async executeByCategory(category, options = {}) {
    const chains = ENDPOINT_CHAINS.filter(c => c.category === category);
    return this.executeAllChains({ ...options, chains });
  }

  /**
   * Execute a single chain
   */
  async executeChain(chain, options = {}) {
    console.log(`\n📋 Chain: ${chain.name}`);
    console.log(`   ${chain.description}`);
    
    // Check if we have required context
    if (chain.requires && chain.requires.length > 0) {
      const missingContext = this.checkRequiredContext(chain.requires);
      if (missingContext.length > 0) {
        console.log(`   ⏭️  Skipping: missing context [${missingContext.join(', ')}]`);
        this.stats.stepsSkipped += chain.steps.length;
        return { skipped: true, reason: 'missing-context', missing: missingContext };
      }
    }
    
    this.stats.chainsExecuted++;
    const chainResults = [];
    
    // Get context values for this chain
    const context = this.buildContext(chain, options);
    
    for (const step of chain.steps) {
      const result = await this.executeStep(step, chain, context, options);
      chainResults.push(result);
      
      // Update context with extracted values for next steps
      if (result.success && result.extractedValues) {
        Object.assign(context, result.extractedValues);
      }
      
      // Stop chain on failure if configured
      if (!result.success && options.stopOnError) {
        console.log(`   ⛔ Stopping chain due to error`);
        break;
      }
    }
    
    return { chain: chain.name, results: chainResults };
  }

  /**
   * Execute a single step in a chain
   */
  async executeStep(step, chain, context, options = {}) {
    const startTime = Date.now();
    
    // Parse endpoint
    const [method, pathTemplate] = step.endpoint.split(' ');
    const path = this.substituteVariables(pathTemplate, context);
    
    console.log(`   ├─ ${step.name}: ${method} ${path}`);
    
    try {
      // Build request options
      const requestOptions = this.buildRequestOptions(step, context);
      
      // Execute the request
      const response = await this.client.request(method, path, requestOptions);
      
      const duration = Date.now() - startTime;
      
      // Store the response
      this.responseStore.addResponse({
        method,
        path,
        pathParams: step.pathParams ? this.substituteObject(step.pathParams, context) : {},
        queryParams: requestOptions.queryParams || {},
        requestBody: requestOptions.body,
        status: response.status,
        responseHeaders: response.headers,
        responseBody: response.data,
        duration,
        useCase: chain.name,
        chainStep: step.name,
        context: { ...context }
      });
      
      // Extract values if configured
      const extractedValues = this.extractValues(step, response);
      
      // Update context store with discovered entities
      this.updateContextFromResponse(step, response);
      
      console.log(`   │  ✅ ${response.status} (${duration}ms)`);
      
      this.stats.stepsExecuted++;
      this.stats.stepsSucceeded++;
      
      return {
        success: true,
        step: step.name,
        status: response.status,
        duration,
        extractedValues
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      console.log(`   │  ❌ ${error.status || 'Error'}: ${error.message} (${duration}ms)`);
      
      // Still store failed responses for analysis
      this.responseStore.addResponse({
        method,
        path,
        pathParams: step.pathParams ? this.substituteObject(step.pathParams, context) : {},
        queryParams: step.queryParams || {},
        requestBody: step.body ? this.substituteObject(step.body, context) : null,
        status: error.status || 0,
        responseBody: error.response?.data || { error: error.message },
        duration,
        useCase: chain.name,
        chainStep: step.name,
        context: { ...context },
        validation: { isValid: false, errors: [error.message] }
      });
      
      this.stats.stepsExecuted++;
      this.stats.stepsFailed++;
      
      this.log('step-error', {
        chain: chain.name,
        step: step.name,
        error: error.message,
        status: error.status
      });
      
      return {
        success: false,
        step: step.name,
        error: error.message,
        status: error.status,
        duration
      };
    }
  }

  /**
   * Build context for chain execution
   */
  buildContext(chain, options = {}) {
    const context = {
      ...this.contextStore.getTestContext(chain.name)
    };
    
    // Add specific test values if provided
    if (options.testValues) {
      Object.assign(context, options.testValues);
    }
    
    // For chains that need a specific asset type, get samples
    if (chain.assetType) {
      const guids = this.contextStore.getGuidsByType(chain.assetType);
      if (guids.length > 0) {
        const guid = guids[0];
        context.guid = guid;
        context[`${chain.assetType.toLowerCase()}Guid`] = guid;
        
        const assetInfo = this.contextStore.guids.get(guid);
        if (assetInfo) {
          context.typeName = assetInfo.typeName;
          context.qualifiedName = assetInfo.qualifiedName;
          context[`${chain.assetType.toLowerCase()}QualifiedName`] = assetInfo.qualifiedName;
        }
      }
    }
    
    // Add first available GUID if not set
    if (!context.guid && this.contextStore.guids.size > 0) {
      const firstGuid = Array.from(this.contextStore.guids.keys())[0];
      context.guid = firstGuid;
      const assetInfo = this.contextStore.guids.get(firstGuid);
      if (assetInfo) {
        context.typeName = assetInfo.typeName;
        context.qualifiedName = assetInfo.qualifiedName;
      }
    }
    
    // Add first available classification if not set
    if (!context.classificationName && this.contextStore.classifications.size > 0) {
      const firstClassification = Array.from(this.contextStore.classifications.values())[0];
      context.classificationName = firstClassification.name;
      context.classificationDisplayName = firstClassification.displayName;
    }
    
    return context;
  }

  /**
   * Build request options for a step
   */
  buildRequestOptions(step, context) {
    const options = {};
    
    // Query parameters
    if (step.queryParams) {
      options.queryParams = this.substituteObject(step.queryParams, context);
    }
    
    // Request body
    if (step.body) {
      options.body = this.substituteObject(step.body, context);
    }
    
    return options;
  }

  /**
   * Substitute {variable} placeholders in a string
   */
  substituteVariables(template, context) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      if (context[key] !== undefined) {
        return context[key];
      }
      console.warn(`   │  ⚠️  Missing context value: ${key}`);
      return match;
    });
  }

  /**
   * Recursively substitute variables in an object
   */
  substituteObject(obj, context) {
    if (typeof obj === 'string') {
      return this.substituteVariables(obj, context);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.substituteObject(item, context));
    }
    
    if (obj && typeof obj === 'object') {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.substituteObject(value, context);
      }
      return result;
    }
    
    return obj;
  }

  /**
   * Check if required context values are available
   */
  checkRequiredContext(requires) {
    const missing = [];
    
    for (const req of requires) {
      switch (req) {
        case 'guid':
        case 'guids':
          if (this.contextStore.guids.size === 0) missing.push(req);
          break;
        case 'fqn':
        case 'fqns':
          if (this.contextStore.fqns.size === 0) missing.push(req);
          break;
        case 'classificationName':
          if (this.contextStore.classifications.size === 0) missing.push(req);
          break;
        case 'tableGuid':
          if (this.contextStore.getGuidsByType('Table').length === 0) missing.push(req);
          break;
        // Add more checks as needed
      }
    }
    
    return missing;
  }

  /**
   * Extract values from response based on extractors
   */
  extractValues(step, response) {
    if (!step.extractors) return {};
    
    const extracted = {};
    const data = response.data;
    
    for (const extractor of step.extractors) {
      switch (extractor) {
        case 'entities':
          if (data.entities && data.entities.length > 0) {
            extracted.entities = data.entities;
            extracted.guid = data.entities[0].guid;
            extracted.typeName = data.entities[0].typeName;
            extracted.qualifiedName = data.entities[0].attributes?.qualifiedName;
          }
          break;
          
        case 'entity':
          if (data.entity) {
            extracted.entity = data.entity;
            extracted.guid = data.entity.guid;
            extracted.typeName = data.entity.typeName;
            extracted.qualifiedName = data.entity.attributes?.qualifiedName;
          }
          break;
          
        case 'referredEntities':
          if (data.referredEntities) {
            extracted.referredEntities = data.referredEntities;
          }
          break;
          
        case 'classifications':
          if (data.list || data.classifications) {
            extracted.classifications = data.list || data.classifications;
          }
          break;
          
        case 'businessAttributes':
          if (data.entity?.businessAttributes) {
            extracted.businessAttributes = data.entity.businessAttributes;
          }
          break;
          
        case 'classificationDefs':
          if (data.classificationDefs) {
            extracted.classificationDefs = data.classificationDefs;
            this.contextStore.addClassifications(data.classificationDefs);
          }
          break;
          
        case 'businessMetadataDefs':
          if (data.businessMetadataDefs) {
            extracted.businessMetadataDefs = data.businessMetadataDefs;
            this.contextStore.addCustomMetadata(data.businessMetadataDefs);
          }
          break;
          
        case 'enumDefs':
          if (data.enumDefs) {
            extracted.enumDefs = data.enumDefs;
            this.contextStore.addEnums(data.enumDefs);
          }
          break;
          
        case 'domains':
          if (data.entities) {
            this.contextStore.addDomains(data.entities);
          }
          break;
          
        case 'terms':
          if (data.entities) {
            this.contextStore.addTerms(data.entities);
          }
          break;
      }
    }
    
    return extracted;
  }

  /**
   * Update context store with entities from response
   */
  updateContextFromResponse(step, response) {
    const data = response.data;
    
    // Add entities from search response
    if (data.entities) {
      for (const entity of data.entities) {
        this.contextStore.addAsset(entity);
      }
    }
    
    // Add entity from single entity response
    if (data.entity) {
      this.contextStore.addAsset(data.entity);
    }
    
    // Add referred entities
    if (data.referredEntities) {
      for (const entity of Object.values(data.referredEntities)) {
        this.contextStore.addAsset(entity);
      }
    }
  }

  /**
   * Log execution event
   */
  log(event, data) {
    this.executionLog.push({
      timestamp: new Date().toISOString(),
      event,
      data
    });
  }

  /**
   * Get execution report
   */
  getReport() {
    return {
      timestamp: new Date().toISOString(),
      stats: this.stats,
      contextStats: this.contextStore.getStats(),
      responseStats: this.responseStore.getStats(),
      executionLog: this.executionLog
    };
  }

  /**
   * Print summary
   */
  printSummary() {
    console.log('\n=== Execution Summary ===\n');
    console.log(`Chains executed: ${this.stats.chainsExecuted}`);
    console.log(`Steps executed: ${this.stats.stepsExecuted}`);
    console.log(`  ✅ Succeeded: ${this.stats.stepsSucceeded}`);
    console.log(`  ❌ Failed: ${this.stats.stepsFailed}`);
    console.log(`  ⏭️  Skipped: ${this.stats.stepsSkipped}`);
    console.log(`\nContext store: ${this.contextStore.guids.size} assets`);
    console.log(`Response store: ${this.responseStore.getStats().total} responses`);
  }
}

export default ExecutorAgent;
