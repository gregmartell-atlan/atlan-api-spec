/**
 * Validator Agent
 * 
 * Validates API responses against expected schemas and business rules.
 * Checks data integrity and consistency.
 */

export class ValidatorAgent {
  constructor(responseStore, contextStore) {
    this.responseStore = responseStore;
    this.contextStore = contextStore;
    
    // Validation stats
    this.stats = {
      totalValidated: 0,
      valid: 0,
      invalid: 0,
      warnings: 0
    };
    
    // Validation errors
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Validate all responses in the store
   */
  async validateAll() {
    console.log('\n✅ Starting Validator Agent...\n');
    
    const responses = this.responseStore.getAll();
    
    for (const response of responses) {
      this.validateResponse(response);
    }
    
    this.printSummary();
    return this.getReport();
  }

  /**
   * Validate a single response
   */
  validateResponse(response) {
    const validationResult = {
      id: response.id,
      endpoint: `${response.method} ${response.path}`,
      status: response.status,
      isValid: true,
      errors: [],
      warnings: []
    };
    
    this.stats.totalValidated++;
    
    // 1. Status code validation
    if (response.status >= 400) {
      validationResult.isValid = false;
      validationResult.errors.push(`HTTP error status: ${response.status}`);
    }
    
    // 2. Response structure validation
    const structureErrors = this.validateStructure(response);
    validationResult.errors.push(...structureErrors);
    
    // 3. GUID format validation
    const guidErrors = this.validateGuids(response);
    validationResult.errors.push(...guidErrors);
    
    // 4. Qualified name validation
    const fqnWarnings = this.validateQualifiedNames(response);
    validationResult.warnings.push(...fqnWarnings);
    
    // 5. Context consistency validation
    const contextErrors = this.validateAgainstContext(response);
    validationResult.errors.push(...contextErrors);
    
    // Update validation status
    if (validationResult.errors.length > 0) {
      validationResult.isValid = false;
      this.stats.invalid++;
      this.errors.push(validationResult);
    } else {
      this.stats.valid++;
    }
    
    if (validationResult.warnings.length > 0) {
      this.stats.warnings += validationResult.warnings.length;
      if (validationResult.isValid) {
        this.warnings.push(validationResult);
      }
    }
    
    // Update the response in store
    response.validation = {
      isValid: validationResult.isValid,
      errors: validationResult.errors,
      warnings: validationResult.warnings
    };
    
    return validationResult;
  }

  /**
   * Validate response structure based on endpoint
   */
  validateStructure(response) {
    const errors = [];
    const data = response.responseBody;
    
    if (!data) {
      return ['Response body is empty'];
    }
    
    // Endpoint-specific validations
    const endpoint = `${response.method} ${response.path}`;
    
    if (endpoint.includes('/api/meta/search/indexsearch')) {
      // Search response should have entities array
      if (response.status === 200 && !Array.isArray(data.entities)) {
        errors.push('Search response missing entities array');
      }
    }
    
    if (endpoint.includes('/api/meta/entity/guid/') && !endpoint.includes('/classifications')) {
      // Single entity response should have entity object
      if (response.status === 200 && !data.entity) {
        errors.push('Entity response missing entity object');
      }
    }
    
    if (endpoint.includes('/classifications') && response.method === 'GET') {
      // Classifications response should have list or classifications array
      if (response.status === 200 && !data.list && !data.classifications && !Array.isArray(data)) {
        errors.push('Classifications response missing list/classifications array');
      }
    }
    
    if (endpoint.includes('/api/meta/types/typedefs')) {
      // TypeDefs response should have appropriate arrays
      if (response.status === 200) {
        const hasDefs = data.classificationDefs || data.businessMetadataDefs || 
                       data.enumDefs || data.entityDefs || data.relationshipDefs;
        if (!hasDefs) {
          errors.push('TypeDefs response missing definition arrays');
        }
      }
    }
    
    if (endpoint.includes('/api/meta/lineage/list')) {
      // Lineage response structure
      if (response.status === 200 && !data.guidEntityMap && !data.baseEntityGuid) {
        errors.push('Lineage response missing expected structure');
      }
    }
    
    return errors;
  }

  /**
   * Validate GUID formats in response
   */
  validateGuids(response) {
    const errors = [];
    const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    const checkGuids = (obj, path = '') => {
      if (!obj || typeof obj !== 'object') return;
      
      if (Array.isArray(obj)) {
        obj.forEach((item, idx) => checkGuids(item, `${path}[${idx}]`));
        return;
      }
      
      for (const [key, value] of Object.entries(obj)) {
        if (key === 'guid' && typeof value === 'string') {
          if (!guidPattern.test(value)) {
            errors.push(`Invalid GUID format at ${path}.${key}: ${value}`);
          }
        } else if (typeof value === 'object') {
          checkGuids(value, `${path}.${key}`);
        }
      }
    };
    
    checkGuids(response.responseBody);
    
    // Limit errors to avoid flooding
    if (errors.length > 5) {
      const count = errors.length;
      errors.splice(5);
      errors.push(`... and ${count - 5} more GUID format errors`);
    }
    
    return errors;
  }

  /**
   * Validate qualified names
   */
  validateQualifiedNames(response) {
    const warnings = [];
    
    const checkQualifiedNames = (obj, path = '') => {
      if (!obj || typeof obj !== 'object') return;
      
      if (Array.isArray(obj)) {
        obj.forEach((item, idx) => checkQualifiedNames(item, `${path}[${idx}]`));
        return;
      }
      
      for (const [key, value] of Object.entries(obj)) {
        if (key === 'qualifiedName' && typeof value === 'string') {
          // Check for common issues
          if (value.includes('//')) {
            warnings.push(`Double slash in qualifiedName at ${path}.${key}`);
          }
          if (value.includes(' ')) {
            warnings.push(`Space in qualifiedName at ${path}.${key}`);
          }
        } else if (typeof value === 'object') {
          checkQualifiedNames(value, `${path}.${key}`);
        }
      }
    };
    
    checkQualifiedNames(response.responseBody);
    
    return warnings;
  }

  /**
   * Validate response against context store
   */
  validateAgainstContext(response) {
    const errors = [];
    
    // If we requested a specific GUID, verify it matches
    if (response.context?.guid && response.responseBody?.entity) {
      const requestedGuid = response.context.guid;
      const returnedGuid = response.responseBody.entity.guid;
      
      if (requestedGuid !== returnedGuid) {
        errors.push(`GUID mismatch: requested ${requestedGuid}, got ${returnedGuid}`);
      }
    }
    
    // If we have entity, verify type matches
    if (response.context?.typeName && response.responseBody?.entity) {
      const expectedType = response.context.typeName;
      const returnedType = response.responseBody.entity.typeName;
      
      if (expectedType !== returnedType) {
        errors.push(`Type mismatch: expected ${expectedType}, got ${returnedType}`);
      }
    }
    
    return errors;
  }

  /**
   * Get validation report
   */
  getReport() {
    return {
      timestamp: new Date().toISOString(),
      stats: this.stats,
      errors: this.errors,
      warnings: this.warnings.slice(0, 20) // Limit warnings
    };
  }

  /**
   * Print validation summary
   */
  printSummary() {
    console.log('\n=== Validation Summary ===\n');
    console.log(`Total validated: ${this.stats.totalValidated}`);
    console.log(`  ✅ Valid: ${this.stats.valid}`);
    console.log(`  ❌ Invalid: ${this.stats.invalid}`);
    console.log(`  ⚠️  Warnings: ${this.stats.warnings}`);
    
    if (this.errors.length > 0) {
      console.log('\n❌ Validation Errors:');
      for (const error of this.errors.slice(0, 10)) {
        console.log(`   ${error.endpoint}: ${error.errors[0]}`);
      }
      if (this.errors.length > 10) {
        console.log(`   ... and ${this.errors.length - 10} more errors`);
      }
    }
    
    if (this.warnings.length > 0 && this.errors.length === 0) {
      console.log('\n⚠️  Validation Warnings:');
      for (const warning of this.warnings.slice(0, 5)) {
        console.log(`   ${warning.endpoint}: ${warning.warnings[0]}`);
      }
    }
  }
}

export default ValidatorAgent;
