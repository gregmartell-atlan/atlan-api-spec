/**
 * QA Debug Agent
 * 
 * Diagnoses failures and suggests fixes.
 * Implements self-healing capabilities for common issues.
 */

export class QADebugAgent {
  constructor(atlanClient, contextStore, responseStore) {
    this.client = atlanClient;
    this.contextStore = contextStore;
    this.responseStore = responseStore;
    
    // Diagnosis stats
    this.stats = {
      failuresAnalyzed: 0,
      diagnosesFound: 0,
      healingActionsApplied: 0
    };
    
    // Healing log
    this.healingLog = [];
  }

  /**
   * Analyze all failed responses
   */
  async analyzeFailures() {
    console.log('\n🔧 Starting QA Debug Agent...\n');
    
    const failures = this.responseStore.getFailed();
    console.log(`Found ${failures.length} failed responses to analyze`);
    
    const diagnoses = [];
    
    for (const failure of failures) {
      const diagnosis = await this.diagnoseFailure(failure);
      if (diagnosis) {
        diagnoses.push(diagnosis);
      }
    }
    
    this.printSummary(diagnoses);
    return diagnoses;
  }

  /**
   * Diagnose a single failure
   */
  async diagnoseFailure(failure) {
    this.stats.failuresAnalyzed++;
    
    const diagnosis = {
      endpoint: `${failure.method} ${failure.path}`,
      status: failure.status,
      useCase: failure.useCase,
      category: 'unknown',
      rootCause: null,
      suggestedFix: null,
      retryable: false,
      healingActions: []
    };
    
    // Analyze by status code
    switch (failure.status) {
      case 400:
        diagnosis.category = 'bad_request';
        this.analyzeBadRequest(failure, diagnosis);
        break;
        
      case 401:
        diagnosis.category = 'authentication';
        diagnosis.rootCause = 'API token is invalid or expired';
        diagnosis.suggestedFix = 'Refresh the API token';
        diagnosis.retryable = true;
        diagnosis.healingActions.push({ action: 'refresh-token' });
        break;
        
      case 403:
        diagnosis.category = 'authorization';
        diagnosis.rootCause = 'Insufficient permissions for this operation';
        diagnosis.suggestedFix = 'Check API token permissions and user roles';
        break;
        
      case 404:
        diagnosis.category = 'not_found';
        await this.analyzeNotFound(failure, diagnosis);
        break;
        
      case 409:
        diagnosis.category = 'conflict';
        diagnosis.rootCause = 'Resource conflict (e.g., duplicate or concurrent update)';
        diagnosis.suggestedFix = 'Retry the operation after refreshing the entity';
        diagnosis.retryable = true;
        break;
        
      case 429:
        diagnosis.category = 'rate_limit';
        diagnosis.rootCause = 'API rate limit exceeded';
        diagnosis.suggestedFix = 'Increase delay between requests';
        diagnosis.retryable = true;
        diagnosis.healingActions.push({ action: 'increase-delay' });
        break;
        
      case 500:
      case 502:
      case 503:
      case 504:
        diagnosis.category = 'server_error';
        diagnosis.rootCause = 'Server-side error';
        diagnosis.suggestedFix = 'Retry after a delay';
        diagnosis.retryable = true;
        diagnosis.healingActions.push({ action: 'retry-with-backoff' });
        break;
        
      default:
        diagnosis.rootCause = 'Unknown error';
        this.analyzeUnknownError(failure, diagnosis);
    }
    
    if (diagnosis.rootCause) {
      this.stats.diagnosesFound++;
    }
    
    return diagnosis;
  }

  /**
   * Analyze 400 Bad Request errors
   */
  analyzeBadRequest(failure, diagnosis) {
    const errorBody = failure.responseBody;
    const errorMessage = errorBody?.errorMessage || errorBody?.message || '';
    
    // Check for specific error patterns
    if (errorMessage.includes('Invalid')) {
      if (errorMessage.includes('GUID') || errorMessage.includes('guid')) {
        diagnosis.rootCause = 'Invalid GUID format or non-existent GUID';
        diagnosis.suggestedFix = 'Re-discover assets to get valid GUIDs';
        diagnosis.healingActions.push({ action: 're-discover', target: 'guids' });
      } else if (errorMessage.includes('qualifiedName')) {
        diagnosis.rootCause = 'Invalid qualifiedName format';
        diagnosis.suggestedFix = 'Verify the qualifiedName format';
      } else if (errorMessage.includes('typeName')) {
        diagnosis.rootCause = 'Invalid or unknown typeName';
        diagnosis.suggestedFix = 'Check available type definitions';
        diagnosis.healingActions.push({ action: 'refresh-typedefs' });
      }
    }
    
    if (errorMessage.includes('required') || errorMessage.includes('missing')) {
      diagnosis.rootCause = 'Missing required field in request';
      diagnosis.suggestedFix = 'Add the missing required field';
    }
    
    if (errorMessage.includes('classification') || errorMessage.includes('tag')) {
      diagnosis.rootCause = 'Classification/tag related error';
      if (errorMessage.includes('not found')) {
        diagnosis.suggestedFix = 'Classification does not exist or use hashed name';
        diagnosis.healingActions.push({ action: 'refresh-classifications' });
      }
    }
    
    if (!diagnosis.rootCause) {
      diagnosis.rootCause = `Bad request: ${errorMessage}`;
    }
  }

  /**
   * Analyze 404 Not Found errors
   */
  async analyzeNotFound(failure, diagnosis) {
    const errorBody = failure.responseBody;
    const errorMessage = errorBody?.errorMessage || errorBody?.message || '';
    
    // Extract GUID from path if present
    const guidMatch = failure.path.match(/guid\/([a-f0-9-]+)/i);
    
    if (guidMatch) {
      const guid = guidMatch[1];
      
      // Check if this GUID is still in our context
      if (this.contextStore.guids.has(guid)) {
        diagnosis.rootCause = 'Asset was deleted or GUID is stale';
        diagnosis.suggestedFix = 'Re-discover assets to get current GUIDs';
        diagnosis.healingActions.push({ 
          action: 're-discover', 
          target: 'guids',
          staleGuid: guid 
        });
        diagnosis.retryable = true;
        
        // Mark this GUID as stale
        this.contextStore.guids.delete(guid);
      } else {
        diagnosis.rootCause = 'GUID not in context - may never have existed';
        diagnosis.suggestedFix = 'Verify the GUID before using';
      }
    } else if (failure.path.includes('/classification/')) {
      diagnosis.rootCause = 'Classification does not exist on this asset';
      diagnosis.suggestedFix = 'Verify asset has this classification before removing';
    } else if (failure.path.includes('/businessmetadata/')) {
      diagnosis.rootCause = 'Business metadata does not exist on this asset';
      diagnosis.suggestedFix = 'Verify asset has this custom metadata before removing';
    } else {
      diagnosis.rootCause = `Resource not found: ${errorMessage}`;
    }
  }

  /**
   * Analyze unknown errors
   */
  analyzeUnknownError(failure, diagnosis) {
    const errorBody = failure.responseBody;
    
    if (typeof errorBody === 'string') {
      diagnosis.rootCause = `Error response: ${errorBody.slice(0, 100)}`;
    } else if (errorBody?.errorMessage) {
      diagnosis.rootCause = errorBody.errorMessage;
    } else if (errorBody?.message) {
      diagnosis.rootCause = errorBody.message;
    } else {
      diagnosis.rootCause = 'Unknown error (no error message in response)';
    }
  }

  /**
   * Apply healing actions
   */
  async applyHealing(diagnosis, discoveryAgent) {
    console.log(`\n🔧 Applying healing for: ${diagnosis.endpoint}`);
    
    for (const action of diagnosis.healingActions) {
      try {
        await this.executeHealingAction(action, discoveryAgent);
        this.stats.healingActionsApplied++;
        this.healingLog.push({
          timestamp: new Date().toISOString(),
          action: action.action,
          target: action.target,
          status: 'success'
        });
      } catch (error) {
        this.healingLog.push({
          timestamp: new Date().toISOString(),
          action: action.action,
          target: action.target,
          status: 'failed',
          error: error.message
        });
      }
    }
  }

  /**
   * Execute a single healing action
   */
  async executeHealingAction(action, discoveryAgent) {
    switch (action.action) {
      case 're-discover':
        console.log(`   ├─ Re-discovering ${action.target}...`);
        if (discoveryAgent) {
          if (action.target === 'guids') {
            await discoveryAgent.discoverViaSearch({ sampleSize: 20 });
          }
        }
        break;
        
      case 'refresh-classifications':
        console.log('   ├─ Refreshing classification definitions...');
        const classResponse = await this.client.getClassificationDefs();
        this.contextStore.addClassifications(classResponse.data?.classificationDefs || []);
        break;
        
      case 'refresh-typedefs':
        console.log('   ├─ Refreshing all type definitions...');
        await this.refreshTypeDefs();
        break;
        
      case 'increase-delay':
        console.log('   ├─ Increasing request delay...');
        if (this.client.requestDelay < 1000) {
          this.client.requestDelay = Math.min(this.client.requestDelay * 2, 1000);
        }
        break;
        
      case 'retry-with-backoff':
        console.log('   ├─ Will retry with exponential backoff...');
        // This is handled by the retry logic in the client
        break;
        
      case 'refresh-token':
        console.log('   ├─ Token refresh needed (manual action required)');
        break;
        
      default:
        console.log(`   ├─ Unknown action: ${action.action}`);
    }
  }

  /**
   * Refresh all type definitions
   */
  async refreshTypeDefs() {
    try {
      const classResponse = await this.client.getClassificationDefs();
      this.contextStore.addClassifications(classResponse.data?.classificationDefs || []);
    } catch (e) { /* ignore */ }
    
    try {
      const bmResponse = await this.client.getBusinessMetadataDefs();
      this.contextStore.addCustomMetadata(bmResponse.data?.businessMetadataDefs || []);
    } catch (e) { /* ignore */ }
    
    try {
      const enumResponse = await this.client.getEnumDefs();
      this.contextStore.addEnums(enumResponse.data?.enumDefs || []);
    } catch (e) { /* ignore */ }
  }

  /**
   * Get report
   */
  getReport() {
    return {
      timestamp: new Date().toISOString(),
      stats: this.stats,
      healingLog: this.healingLog
    };
  }

  /**
   * Print summary
   */
  printSummary(diagnoses) {
    console.log('\n=== Debug Agent Summary ===\n');
    console.log(`Failures analyzed: ${this.stats.failuresAnalyzed}`);
    console.log(`Diagnoses found: ${this.stats.diagnosesFound}`);
    console.log(`Healing actions applied: ${this.stats.healingActionsApplied}`);
    
    if (diagnoses.length > 0) {
      // Group by category
      const byCategory = {};
      for (const d of diagnoses) {
        byCategory[d.category] = (byCategory[d.category] || 0) + 1;
      }
      
      console.log('\nFailures by category:');
      for (const [category, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${category}: ${count}`);
      }
      
      // Show some examples
      console.log('\nExample diagnoses:');
      for (const d of diagnoses.slice(0, 5)) {
        console.log(`  ${d.endpoint}`);
        console.log(`    Category: ${d.category}`);
        console.log(`    Root cause: ${d.rootCause}`);
        if (d.suggestedFix) {
          console.log(`    Suggested fix: ${d.suggestedFix}`);
        }
      }
    }
  }
}

export default QADebugAgent;
