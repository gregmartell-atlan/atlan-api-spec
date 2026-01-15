/**
 * Atlan API Client
 * 
 * Provides authenticated access to all Atlan REST API endpoints.
 * Handles retries, rate limiting, and response normalization.
 */

import https from 'https';
import http from 'http';

export class AtlanClient {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || process.env.ATLAN_BASE_URL;
    this.apiToken = config.apiToken || process.env.ATLAN_API_TOKEN;
    
    if (!this.baseUrl) {
      throw new Error('ATLAN_BASE_URL is required (e.g., https://your-tenant.atlan.com)');
    }
    if (!this.apiToken) {
      throw new Error('ATLAN_API_TOKEN is required');
    }
    
    // Remove trailing slash
    this.baseUrl = this.baseUrl.replace(/\/$/, '');
    
    // Rate limiting
    this.requestDelay = config.requestDelay || 100; // ms between requests
    this.lastRequestTime = 0;
    
    // Retry configuration
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
  }

  /**
   * Make an HTTP request to the Atlan API
   */
  async request(method, path, options = {}) {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.requestDelay) {
      await this.sleep(this.requestDelay - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();

    const url = new URL(path, this.baseUrl);
    
    // Add query parameters
    if (options.queryParams) {
      for (const [key, value] of Object.entries(options.queryParams)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers = {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...options.headers
    };

    const requestOptions = {
      method,
      headers,
    };

    let body = null;
    if (options.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
      body = JSON.stringify(options.body);
      requestOptions.headers['Content-Length'] = Buffer.byteLength(body);
    }

    // Retry logic
    let lastError = null;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.executeRequest(url, requestOptions, body);
        return response;
      } catch (error) {
        lastError = error;
        
        // Don't retry on 4xx errors (except 429)
        if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
          throw error;
        }
        
        // Exponential backoff
        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          console.warn(`Request failed, retrying in ${delay}ms... (attempt ${attempt + 1}/${this.maxRetries})`);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError;
  }

  executeRequest(url, options, body) {
    return new Promise((resolve, reject) => {
      const protocol = url.protocol === 'https:' ? https : http;
      
      const req = protocol.request(url, options, (res) => {
        let data = '';
        
        res.on('data', chunk => {
          data += chunk;
        });
        
        res.on('end', () => {
          const response = {
            status: res.statusCode,
            headers: res.headers,
            data: null,
            raw: data
          };
          
          // Try to parse JSON
          try {
            if (data && res.headers['content-type']?.includes('application/json')) {
              response.data = JSON.parse(data);
            } else {
              response.data = data;
            }
          } catch (e) {
            response.data = data;
          }
          
          // Check for error status
          if (res.statusCode >= 400) {
            const error = new Error(`HTTP ${res.statusCode}: ${response.data?.errorMessage || data}`);
            error.status = res.statusCode;
            error.response = response;
            reject(error);
          } else {
            resolve(response);
          }
        });
      });
      
      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      
      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================
  // SEARCH ENDPOINTS
  // ============================================================

  /**
   * Search for entities using Elasticsearch DSL
   */
  async search(dsl, options = {}) {
    const body = {
      dsl,
      attributes: options.attributes || [],
      relationAttributes: options.relationAttributes || [],
      ...(options.suppressLogs !== undefined && { suppressLogs: options.suppressLogs })
    };
    
    return this.request('POST', '/api/meta/search/indexsearch', { body });
  }

  /**
   * Search for entities by qualifiedName (FQN)
   */
  async searchByFqn(qualifiedName, options = {}) {
    const dsl = {
      query: {
        term: {
          'qualifiedName': qualifiedName
        }
      },
      size: 1
    };
    
    return this.search(dsl, {
      attributes: options.attributes || [
        'guid', 'qualifiedName', 'name', 'typeName', 
        'classifications', 'businessAttributes', 'meanings',
        '__hasLineage', 'certificateStatus', 'ownerUsers', 'ownerGroups'
      ],
      ...options
    });
  }

  /**
   * Bulk search for multiple FQNs
   */
  async searchByFqns(qualifiedNames, options = {}) {
    const dsl = {
      query: {
        terms: {
          'qualifiedName': qualifiedNames
        }
      },
      size: qualifiedNames.length
    };
    
    return this.search(dsl, {
      attributes: options.attributes || [
        'guid', 'qualifiedName', 'name', 'typeName',
        'classifications', 'businessAttributes', 'meanings',
        '__hasLineage', 'certificateStatus'
      ],
      ...options
    });
  }

  // ============================================================
  // ENTITY ENDPOINTS
  // ============================================================

  /**
   * Get entity by GUID
   */
  async getByGuid(guid, options = {}) {
    const queryParams = {
      minExtInfo: options.minExtInfo ?? false,
      ignoreRelationships: options.ignoreRelationships ?? false
    };
    
    return this.request('GET', `/api/meta/entity/guid/${guid}`, { queryParams });
  }

  /**
   * Get entity by unique attribute (typically qualifiedName)
   */
  async getByUniqueAttribute(typeName, qualifiedName, options = {}) {
    const queryParams = {
      'attr:qualifiedName': qualifiedName,
      minExtInfo: options.minExtInfo ?? false,
      ignoreRelationships: options.ignoreRelationships ?? false
    };
    
    return this.request('GET', `/api/meta/entity/uniqueAttribute/type/${typeName}`, { queryParams });
  }

  /**
   * Bulk create/update entities
   */
  async bulkUpdate(entities, options = {}) {
    const queryParams = {};
    if (options.appendTags !== undefined) queryParams.appendTags = options.appendTags;
    if (options.replaceBusinessAttributes !== undefined) queryParams.replaceBusinessAttributes = options.replaceBusinessAttributes;
    if (options.replaceClassifications !== undefined) queryParams.replaceClassifications = options.replaceClassifications;
    if (options.overwriteBusinessAttributes !== undefined) queryParams.overwriteBusinessAttributes = options.overwriteBusinessAttributes;
    
    return this.request('POST', '/api/meta/entity/bulk', {
      body: { entities },
      queryParams
    });
  }

  /**
   * Delete entity by GUID (soft delete)
   */
  async deleteByGuid(guid) {
    return this.request('DELETE', `/api/meta/entity/guid/${guid}`);
  }

  // ============================================================
  // CLASSIFICATION ENDPOINTS
  // ============================================================

  /**
   * Get classifications on an entity
   */
  async getClassifications(guid) {
    return this.request('GET', `/api/meta/entity/guid/${guid}/classifications`);
  }

  /**
   * Add classifications to an entity
   */
  async addClassifications(guid, classifications) {
    return this.request('POST', `/api/meta/entity/guid/${guid}/classifications`, {
      body: classifications
    });
  }

  /**
   * Remove a classification from an entity
   */
  async removeClassification(guid, classificationName) {
    return this.request('DELETE', `/api/meta/entity/guid/${guid}/classification/${encodeURIComponent(classificationName)}`);
  }

  // ============================================================
  // BUSINESS METADATA (Custom Metadata) ENDPOINTS
  // ============================================================

  /**
   * Get business metadata on an entity
   */
  async getBusinessMetadata(guid) {
    // Business metadata is included in the entity response
    const response = await this.getByGuid(guid);
    return {
      status: response.status,
      data: response.data?.entity?.businessAttributes || {}
    };
  }

  /**
   * Add/update business metadata on an entity
   */
  async updateBusinessMetadata(guid, businessMetadata, options = {}) {
    const queryParams = {
      isOverwrite: options.isOverwrite ?? false
    };
    
    return this.request('POST', `/api/meta/entity/guid/${guid}/businessmetadata`, {
      body: businessMetadata,
      queryParams
    });
  }

  /**
   * Remove business metadata from an entity
   */
  async removeBusinessMetadata(guid, businessMetadataName) {
    return this.request('DELETE', `/api/meta/entity/guid/${guid}/businessmetadata/${encodeURIComponent(businessMetadataName)}`);
  }

  // ============================================================
  // LINEAGE ENDPOINTS
  // ============================================================

  /**
   * Get lineage using the list endpoint
   */
  async getLineageList(guid, options = {}) {
    const body = {
      guid,
      depth: options.depth ?? 1,
      direction: options.direction ?? 'BOTH',
      hideProcess: options.hideProcess ?? true,
      allowDeletedProcess: options.allowDeletedProcess ?? false
    };
    
    return this.request('POST', '/api/meta/lineage/list', { body });
  }

  /**
   * Get lineage using the getlineage endpoint (legacy)
   */
  async getLineage(guid, options = {}) {
    const queryParams = {
      guid,
      depth: options.depth ?? 1,
      direction: options.direction ?? 'BOTH'
    };
    
    return this.request('GET', '/api/meta/lineage/getlineage', { queryParams });
  }

  // ============================================================
  // TYPE DEFINITION ENDPOINTS
  // ============================================================

  /**
   * Get all type definitions (or filtered by type)
   */
  async getTypeDefs(typeFilter = null) {
    const queryParams = {};
    if (typeFilter) {
      queryParams.type = typeFilter;
    }
    
    return this.request('GET', '/api/meta/types/typedefs', { queryParams });
  }

  /**
   * Get classifications (tags) definitions
   */
  async getClassificationDefs() {
    return this.getTypeDefs('classification');
  }

  /**
   * Get business metadata (custom metadata) definitions
   */
  async getBusinessMetadataDefs() {
    return this.getTypeDefs('businessMetadata');
  }

  /**
   * Get enum definitions (for badges, etc.)
   */
  async getEnumDefs() {
    return this.getTypeDefs('enum');
  }

  /**
   * Create/update type definitions
   */
  async createTypeDefs(typeDefs) {
    return this.request('POST', '/api/meta/types/typedefs', { body: typeDefs });
  }

  /**
   * Delete a type definition by name
   */
  async deleteTypeDef(name) {
    return this.request('DELETE', `/api/meta/types/typedef/name/${encodeURIComponent(name)}`);
  }

  // ============================================================
  // AUDIT ENDPOINTS
  // ============================================================

  /**
   * Search entity audit history
   */
  async searchAudit(dsl, options = {}) {
    return this.request('POST', '/api/meta/entity/auditSearch', {
      body: {
        dsl,
        ...options
      }
    });
  }

  /**
   * Get audit history for a specific entity
   */
  async getEntityAudit(guid, options = {}) {
    const dsl = {
      query: {
        term: {
          entityId: guid
        }
      },
      size: options.size ?? 10,
      sort: [{ timestamp: { order: 'desc' } }]
    };
    
    return this.searchAudit(dsl, options);
  }

  // ============================================================
  // WORKFLOW ENDPOINTS
  // ============================================================

  /**
   * Search for workflows
   */
  async searchWorkflows(dsl) {
    return this.request('POST', '/api/service/workflows/indexsearch', {
      body: { ...dsl }
    });
  }

  /**
   * Submit a workflow
   */
  async submitWorkflow(payload) {
    return this.request('POST', '/api/service/workflows/submit', {
      body: payload
    });
  }

  /**
   * Search for workflow runs
   */
  async searchRuns(dsl) {
    return this.request('POST', '/api/service/runs/indexsearch', {
      body: { ...dsl }
    });
  }

  // ============================================================
  // TASK ENDPOINTS
  // ============================================================

  /**
   * Search for background tasks
   */
  async searchTasks(dsl) {
    return this.request('POST', '/api/meta/task/search', {
      body: { dsl }
    });
  }

  // ============================================================
  // SEARCH LOG ENDPOINTS
  // ============================================================

  /**
   * Log a search event
   */
  async logSearch(payload) {
    return this.request('POST', '/api/meta/search/searchlog', {
      body: payload
    });
  }

  // ============================================================
  // HEALTH ENDPOINTS
  // ============================================================

  /**
   * Check service health
   */
  async health() {
    return this.request('GET', '/api/service/health');
  }
}

export default AtlanClient;
