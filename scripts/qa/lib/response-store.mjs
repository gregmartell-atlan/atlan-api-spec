/**
 * Response Store
 * 
 * Captures and stores API responses during QA execution.
 * Provides export capabilities for OpenAPI examples and reports.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class ResponseStore {
  constructor() {
    // Responses indexed by endpoint
    this.responses = new Map();  // "METHOD:path" -> ResponseEntry[]
    
    // Responses by use case / chain
    this.responsesByUseCase = new Map();  // useCase -> ResponseEntry[]
    
    // All responses in order
    this.allResponses = [];
    
    // Statistics
    this.stats = {
      total: 0,
      successful: 0,
      failed: 0,
      byStatus: {}
    };
  }

  /**
   * Generate a unique ID for a response entry
   */
  generateId(entry) {
    const hash = crypto.createHash('md5')
      .update(`${entry.method}:${entry.path}:${Date.now()}:${Math.random()}`)
      .digest('hex')
      .slice(0, 12);
    return `${entry.method.toLowerCase()}_${this.sanitizePath(entry.path)}_${hash}`;
  }

  /**
   * Sanitize path for use as identifier
   */
  sanitizePath(path) {
    return path
      .replace(/^\/api\//, '')
      .replace(/\//g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .slice(0, 40);
  }

  /**
   * Add a response to the store
   */
  addResponse(entry) {
    const id = this.generateId(entry);
    
    const responseEntry = {
      id,
      timestamp: new Date().toISOString(),
      method: entry.method,
      path: entry.path,
      pathParams: entry.pathParams || {},
      queryParams: entry.queryParams || {},
      requestHeaders: this.sanitizeHeaders(entry.requestHeaders || {}),
      requestBody: entry.requestBody,
      status: entry.status,
      responseHeaders: this.sanitizeHeaders(entry.responseHeaders || {}),
      responseBody: entry.responseBody,
      duration: entry.duration,
      useCase: entry.useCase || 'unknown',
      chainStep: entry.chainStep,
      context: entry.context || {},
      validation: entry.validation || { isValid: true, errors: [] }
    };

    // Index by endpoint
    const endpointKey = `${entry.method}:${entry.path}`;
    if (!this.responses.has(endpointKey)) {
      this.responses.set(endpointKey, []);
    }
    this.responses.get(endpointKey).push(responseEntry);

    // Index by use case
    if (!this.responsesByUseCase.has(entry.useCase)) {
      this.responsesByUseCase.set(entry.useCase, []);
    }
    this.responsesByUseCase.get(entry.useCase).push(responseEntry);

    // Add to all responses
    this.allResponses.push(responseEntry);

    // Update stats
    this.stats.total++;
    if (entry.status >= 200 && entry.status < 300) {
      this.stats.successful++;
    } else {
      this.stats.failed++;
    }
    this.stats.byStatus[entry.status] = (this.stats.byStatus[entry.status] || 0) + 1;

    return responseEntry;
  }

  /**
   * Remove sensitive headers
   */
  sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    const sensitiveKeys = ['authorization', 'cookie', 'set-cookie', 'x-api-key'];
    for (const key of sensitiveKeys) {
      if (sanitized[key]) {
        sanitized[key] = '[REDACTED]';
      }
      if (sanitized[key.toLowerCase()]) {
        sanitized[key.toLowerCase()] = '[REDACTED]';
      }
    }
    return sanitized;
  }

  /**
   * Get responses for a specific endpoint
   */
  getByEndpoint(method, path) {
    return this.responses.get(`${method}:${path}`) || [];
  }

  /**
   * Get responses for a specific use case
   */
  getByUseCase(useCase) {
    return this.responsesByUseCase.get(useCase) || [];
  }

  /**
   * Get all responses
   */
  getAll() {
    return this.allResponses;
  }

  /**
   * Get successful responses only
   */
  getSuccessful() {
    return this.allResponses.filter(r => r.status >= 200 && r.status < 300);
  }

  /**
   * Get failed responses only
   */
  getFailed() {
    return this.allResponses.filter(r => r.status >= 400);
  }

  /**
   * Get unique endpoints
   */
  getUniqueEndpoints() {
    return Array.from(this.responses.keys());
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      uniqueEndpoints: this.responses.size,
      useCases: this.responsesByUseCase.size
    };
  }

  // ============================================================
  // EXPORT METHODS
  // ============================================================

  /**
   * Export responses as OpenAPI examples
   */
  exportAsOpenAPIExamples() {
    const examples = {};
    
    for (const [endpoint, responses] of this.responses) {
      const [method, path] = endpoint.split(':');
      
      // Group by successful responses
      const successfulResponses = responses.filter(r => r.status >= 200 && r.status < 300);
      
      if (successfulResponses.length === 0) continue;
      
      examples[endpoint] = {
        requestExamples: {},
        responseExamples: {}
      };
      
      // Take up to 5 unique examples per endpoint
      const seen = new Set();
      let exampleCount = 0;
      
      for (const response of successfulResponses) {
        // Skip if we've seen this request body before
        const requestKey = JSON.stringify(response.requestBody);
        if (seen.has(requestKey)) continue;
        seen.add(requestKey);
        
        if (exampleCount >= 5) break;
        
        const exampleName = `${response.useCase}_${exampleCount}`;
        
        // Request example
        if (response.requestBody) {
          examples[endpoint].requestExamples[exampleName] = {
            summary: `${response.useCase} - Example ${exampleCount + 1}`,
            value: response.requestBody,
            'x-useCase': response.useCase,
            'x-chainStep': response.chainStep
          };
        }
        
        // Response example
        if (response.responseBody) {
          examples[endpoint].responseExamples[exampleName] = {
            summary: `${response.useCase} - Response ${exampleCount + 1}`,
            value: this.sanitizeResponseBody(response.responseBody),
            'x-status': response.status,
            'x-useCase': response.useCase
          };
        }
        
        exampleCount++;
      }
    }
    
    return examples;
  }

  /**
   * Sanitize response body (remove sensitive data, truncate large arrays)
   */
  sanitizeResponseBody(body) {
    if (!body) return body;
    
    // Deep clone
    const sanitized = JSON.parse(JSON.stringify(body));
    
    // Truncate large arrays
    const truncateArrays = (obj) => {
      if (Array.isArray(obj)) {
        if (obj.length > 3) {
          return [...obj.slice(0, 3), `... (${obj.length - 3} more items)`];
        }
        return obj.map(truncateArrays);
      }
      if (obj && typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
          obj[key] = truncateArrays(obj[key]);
        }
      }
      return obj;
    };
    
    return truncateArrays(sanitized);
  }

  /**
   * Export to YAML for OpenAPI spec
   */
  exportToYAML() {
    const examples = this.exportAsOpenAPIExamples();
    const lines = [];
    
    for (const [endpoint, data] of Object.entries(examples)) {
      lines.push(`# ${endpoint}`);
      lines.push('requestBody:');
      lines.push('  content:');
      lines.push('    application/json:');
      lines.push('      examples:');
      
      for (const [name, example] of Object.entries(data.requestExamples)) {
        lines.push(`        ${name}:`);
        lines.push(`          summary: "${example.summary}"`);
        lines.push(`          value:`);
        const valueYaml = JSON.stringify(example.value, null, 2)
          .split('\n')
          .map(l => `            ${l}`)
          .join('\n');
        lines.push(valueYaml);
      }
      
      lines.push('');
    }
    
    return lines.join('\n');
  }

  /**
   * Export full report as JSON
   */
  exportFullReport(filePath) {
    const report = {
      timestamp: new Date().toISOString(),
      stats: this.getStats(),
      endpointSummary: {},
      responses: this.allResponses
    };
    
    // Add endpoint summary
    for (const [endpoint, responses] of this.responses) {
      report.endpointSummary[endpoint] = {
        total: responses.length,
        successful: responses.filter(r => r.status >= 200 && r.status < 300).length,
        failed: responses.filter(r => r.status >= 400).length
      };
    }
    
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
    console.log(`Full report exported to ${filePath}`);
  }

  /**
   * Export examples for OpenAPI spec
   */
  exportExamples(filePath) {
    const examples = this.exportAsOpenAPIExamples();
    fs.writeFileSync(filePath, JSON.stringify(examples, null, 2));
    console.log(`OpenAPI examples exported to ${filePath}`);
  }

  /**
   * Export as use-case focused documentation
   */
  exportUseCaseDocs(outputDir) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    for (const [useCase, responses] of this.responsesByUseCase) {
      const doc = {
        useCase,
        description: `API calls for ${useCase}`,
        steps: responses.map((r, idx) => ({
          step: idx + 1,
          endpoint: `${r.method} ${r.path}`,
          request: r.requestBody,
          response: {
            status: r.status,
            body: this.sanitizeResponseBody(r.responseBody)
          },
          duration: r.duration
        }))
      };
      
      const fileName = useCase.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
      fs.writeFileSync(path.join(outputDir, fileName), JSON.stringify(doc, null, 2));
    }
    
    console.log(`Use case docs exported to ${outputDir}`);
  }

  // ============================================================
  // PERSISTENCE
  // ============================================================

  /**
   * Save store to disk
   */
  save(filePath) {
    const data = {
      timestamp: new Date().toISOString(),
      responses: this.allResponses,
      stats: this.stats
    };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Response store saved to ${filePath}`);
  }

  /**
   * Load store from disk
   */
  load(filePath) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    // Clear existing data
    this.responses = new Map();
    this.responsesByUseCase = new Map();
    this.allResponses = [];
    this.stats = data.stats || this.stats;
    
    // Re-index all responses
    for (const entry of data.responses || []) {
      const endpointKey = `${entry.method}:${entry.path}`;
      
      if (!this.responses.has(endpointKey)) {
        this.responses.set(endpointKey, []);
      }
      this.responses.get(endpointKey).push(entry);
      
      if (!this.responsesByUseCase.has(entry.useCase)) {
        this.responsesByUseCase.set(entry.useCase, []);
      }
      this.responsesByUseCase.get(entry.useCase).push(entry);
      
      this.allResponses.push(entry);
    }
    
    console.log(`Response store loaded from ${filePath}`);
    console.log(`Loaded ${this.allResponses.length} responses`);
  }
}

export default ResponseStore;
