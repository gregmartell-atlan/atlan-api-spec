/**
 * QA Orchestrator
 * 
 * Coordinates all agents to run the complete QA pipeline.
 * Handles iterative execution with healing between runs.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { AtlanClient } from './lib/atlan-client.mjs';
import { ContextStore } from './lib/context-store.mjs';
import { ResponseStore } from './lib/response-store.mjs';
import { DiscoveryAgent } from './agents/discovery-agent.mjs';
import { ExecutorAgent } from './agents/executor-agent.mjs';
import { ValidatorAgent } from './agents/validator-agent.mjs';
import { QADebugAgent } from './agents/qa-debug-agent.mjs';
import { exportCompleteDocsToFiles } from './exporters/openapi-exporter.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class QAOrchestrator {
  constructor(config = {}) {
    this.config = {
      baseUrl: config.baseUrl || process.env.ATLAN_BASE_URL,
      apiToken: config.apiToken || process.env.ATLAN_API_TOKEN,
      fqnCsvPath: config.fqnCsvPath,
      outputDir: config.outputDir || path.join(__dirname, '../../src/generated/qa'),
      maxIterations: config.maxIterations || 3,
      safeOnly: config.safeOnly ?? true,
      ...config
    };
    
    // Create output directory
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
    
    // Initialize components
    this.client = new AtlanClient({
      baseUrl: this.config.baseUrl,
      apiToken: this.config.apiToken
    });
    
    this.contextStore = new ContextStore();
    this.responseStore = new ResponseStore();
    
    // Initialize agents
    this.discoveryAgent = new DiscoveryAgent(this.client, this.contextStore, this.responseStore);
    this.executorAgent = new ExecutorAgent(this.client, this.contextStore, this.responseStore);
    this.validatorAgent = new ValidatorAgent(this.responseStore, this.contextStore);
    this.debugAgent = new QADebugAgent(this.client, this.contextStore, this.responseStore);
    
    // Run history
    this.iterations = [];
  }

  /**
   * Run the full QA pipeline
   */
  async run() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║           Atlan API QA Orchestrator                          ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log(`\nBase URL: ${this.config.baseUrl}`);
    console.log(`Output directory: ${this.config.outputDir}`);
    if (this.config.fqnCsvPath) {
      console.log(`FQN CSV: ${this.config.fqnCsvPath}`);
    }
    console.log(`Max iterations: ${this.config.maxIterations}`);
    console.log(`Safe mode: ${this.config.safeOnly ? 'ON (no write operations)' : 'OFF'}`);
    
    const startTime = Date.now();
    
    try {
      // Phase 1: Discovery
      console.log('\n' + '═'.repeat(60));
      console.log('PHASE 1: DISCOVERY');
      console.log('═'.repeat(60));
      
      await this.discoveryAgent.discoverAll({
        fqnCsvPath: this.config.fqnCsvPath,
        batchSize: this.config.batchSize || 20,
        sampleSize: this.config.sampleSize || 50
      });
      
      // Check if we have enough context to proceed
      if (this.contextStore.guids.size === 0) {
        console.log('\n⚠️  Warning: No assets discovered. Cannot proceed with endpoint testing.');
        console.log('   Make sure your API token has access to assets.');
        return this.generateReport(Date.now() - startTime);
      }
      
      // Phase 2: Iterative Execution
      for (let iteration = 1; iteration <= this.config.maxIterations; iteration++) {
        console.log('\n' + '═'.repeat(60));
        console.log(`PHASE 2: EXECUTION (Iteration ${iteration}/${this.config.maxIterations})`);
        console.log('═'.repeat(60));
        
        const iterationResult = await this.runIteration(iteration);
        this.iterations.push(iterationResult);
        
        // Check if we should continue
        if (iterationResult.execution.stats.stepsFailed === 0) {
          console.log(`\n✨ All tests passed on iteration ${iteration}!`);
          break;
        }
        
        // Apply healing if not the last iteration
        if (iteration < this.config.maxIterations && iterationResult.diagnoses.length > 0) {
          console.log('\n' + '─'.repeat(40));
          console.log('Applying healing actions...');
          
          for (const diagnosis of iterationResult.diagnoses) {
            if (diagnosis.healingActions.length > 0) {
              await this.debugAgent.applyHealing(diagnosis, this.discoveryAgent);
            }
          }
        }
      }
      
      // Phase 3: Final Validation
      console.log('\n' + '═'.repeat(60));
      console.log('PHASE 3: VALIDATION');
      console.log('═'.repeat(60));
      
      await this.validatorAgent.validateAll();
      
      // Phase 4: Export Results
      console.log('\n' + '═'.repeat(60));
      console.log('PHASE 4: EXPORT');
      console.log('═'.repeat(60));
      
      await this.exportResults();
      
      const totalTime = Date.now() - startTime;
      return this.generateReport(totalTime);
      
    } catch (error) {
      console.error('\n❌ Fatal error:', error.message);
      throw error;
    }
  }

  /**
   * Run a single iteration of the QA pipeline
   */
  async runIteration(iterationNumber) {
    // Execute all chains
    const executionResult = await this.executorAgent.executeAllChains({
      safeOnly: this.config.safeOnly,
      stopOnError: false
    });
    
    // Analyze failures
    const diagnoses = await this.debugAgent.analyzeFailures();
    
    return {
      iteration: iterationNumber,
      execution: executionResult,
      diagnoses,
      contextStats: this.contextStore.getStats(),
      responseStats: this.responseStore.getStats()
    };
  }

  /**
   * Export all results
   */
  async exportResults() {
    const outputDir = this.config.outputDir;
    
    // Export context store
    const contextPath = path.join(outputDir, 'context-store.json');
    this.contextStore.export(contextPath);
    console.log(`✓ Context store: ${contextPath}`);
    
    // Export response store
    const responsePath = path.join(outputDir, 'response-store.json');
    this.responseStore.save(responsePath);
    console.log(`✓ Response store: ${responsePath}`);
    
    // Export full report
    const reportPath = path.join(outputDir, 'qa-report.json');
    this.responseStore.exportFullReport(reportPath);
    console.log(`✓ Full report: ${reportPath}`);
    
    // Export OpenAPI examples
    const examplesPath = path.join(outputDir, 'openapi-examples.json');
    this.responseStore.exportExamples(examplesPath);
    console.log(`✓ OpenAPI examples: ${examplesPath}`);
    
    // Export use case docs
    const useCaseDir = path.join(outputDir, 'use-cases');
    this.responseStore.exportUseCaseDocs(useCaseDir);
    console.log(`✓ Use case docs: ${useCaseDir}`);
    
    // Export complete docs with schemas
    console.log(`\n📋 Generating response schemas...`);
    const allResponses = this.responseStore.responses;
    exportCompleteDocsToFiles(allResponses, outputDir);
    console.log(`✓ Complete OpenAPI docs with schemas: ${outputDir}/openapi-complete.json`);
    console.log(`✓ Schema components: ${outputDir}/openapi-schemas.json`);
    console.log(`✓ YAML-ready format: ${outputDir}/openapi-yaml-ready.json`);
    
    console.log(`\n📁 All outputs written to: ${outputDir}`);
  }

  /**
   * Generate final report
   */
  generateReport(totalTime) {
    const report = {
      timestamp: new Date().toISOString(),
      duration: `${(totalTime / 1000).toFixed(2)}s`,
      config: {
        baseUrl: this.config.baseUrl,
        fqnCsvPath: this.config.fqnCsvPath,
        maxIterations: this.config.maxIterations,
        safeOnly: this.config.safeOnly
      },
      summary: {
        totalIterations: this.iterations.length,
        totalResponses: this.responseStore.getStats().total,
        successfulResponses: this.responseStore.getStats().successful,
        failedResponses: this.responseStore.getStats().failed,
        assetsDiscovered: this.contextStore.guids.size,
        classificationsDiscovered: this.contextStore.classifications.size,
        customMetadataDiscovered: this.contextStore.customMetadata.size,
        uniqueEndpointsTested: this.responseStore.getStats().uniqueEndpoints
      },
      iterations: this.iterations,
      validation: this.validatorAgent.getReport(),
      debug: this.debugAgent.getReport()
    };
    
    // Print final summary
    console.log('\n' + '═'.repeat(60));
    console.log('FINAL SUMMARY');
    console.log('═'.repeat(60));
    console.log(`\nTotal time: ${report.duration}`);
    console.log(`Iterations: ${report.summary.totalIterations}`);
    console.log(`\nResponses captured: ${report.summary.totalResponses}`);
    console.log(`  ✅ Successful: ${report.summary.successfulResponses}`);
    console.log(`  ❌ Failed: ${report.summary.failedResponses}`);
    console.log(`\nAssets in context: ${report.summary.assetsDiscovered}`);
    console.log(`Classifications: ${report.summary.classificationsDiscovered}`);
    console.log(`Custom metadata types: ${report.summary.customMetadataDiscovered}`);
    console.log(`\nUnique endpoints tested: ${report.summary.uniqueEndpointsTested}`);
    
    return report;
  }

  /**
   * Run discovery only
   */
  async runDiscoveryOnly() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║           Discovery Mode                                     ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    
    await this.discoveryAgent.discoverAll({
      fqnCsvPath: this.config.fqnCsvPath,
      batchSize: this.config.batchSize || 20,
      sampleSize: this.config.sampleSize || 50
    });
    
    // Export context
    const contextPath = path.join(this.config.outputDir, 'context-store.json');
    this.contextStore.export(contextPath);
    
    return this.discoveryAgent.getReport();
  }

  /**
   * Run execution only (assumes context already loaded)
   */
  async runExecutionOnly(contextPath) {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║           Execution Mode                                     ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    
    if (contextPath) {
      this.contextStore.import(contextPath);
    }
    
    return this.executorAgent.executeAllChains({
      safeOnly: this.config.safeOnly
    });
  }

  /**
   * Run validation only (assumes responses already loaded)
   */
  async runValidationOnly(responsePath) {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║           Validation Mode                                    ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    
    if (responsePath) {
      this.responseStore.load(responsePath);
    }
    
    return this.validatorAgent.validateAll();
  }
}

export default QAOrchestrator;
