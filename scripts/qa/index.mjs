#!/usr/bin/env node

/**
 * Atlan API QA Runner
 * 
 * CLI entry point for the API QA system.
 * 
 * Usage:
 *   node scripts/qa/index.mjs --help
 *   node scripts/qa/index.mjs --fqn-csv=/path/to/assets.csv
 *   node scripts/qa/index.mjs --mode=discovery
 *   node scripts/qa/index.mjs --mode=full --iterations=3
 * 
 * Environment variables:
 *   ATLAN_BASE_URL - Atlan tenant URL (e.g., https://your-tenant.atlan.com)
 *   ATLAN_API_TOKEN - API token for authentication
 */

import { QAOrchestrator } from './orchestrator.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
function parseArgs() {
  const args = {
    mode: 'full',
    fqnCsvPath: null,
    iterations: 3,
    safeOnly: true,
    outputDir: null,
    contextPath: null,
    responsePath: null,
    help: false
  };
  
  for (const arg of process.argv.slice(2)) {
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg.startsWith('--mode=')) {
      args.mode = arg.split('=')[1];
    } else if (arg.startsWith('--fqn-csv=')) {
      args.fqnCsvPath = arg.split('=')[1];
    } else if (arg.startsWith('--iterations=')) {
      args.iterations = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--unsafe') {
      args.safeOnly = false;
    } else if (arg.startsWith('--output=')) {
      args.outputDir = arg.split('=')[1];
    } else if (arg.startsWith('--context=')) {
      args.contextPath = arg.split('=')[1];
    } else if (arg.startsWith('--responses=')) {
      args.responsePath = arg.split('=')[1];
    }
  }
  
  return args;
}

function printHelp() {
  console.log(`
Atlan API QA Runner

Usage:
  node scripts/qa/index.mjs [options]

Options:
  --help, -h              Show this help message
  --mode=MODE             Execution mode: full, discovery, execution, validation
  --fqn-csv=PATH          Path to CSV file containing FQNs (qualifiedNames)
  --iterations=N          Maximum number of iterations (default: 3)
  --unsafe                Allow destructive operations (default: safe mode)
  --output=PATH           Output directory for results
  --context=PATH          Load context from file (for execution/validation modes)
  --responses=PATH        Load responses from file (for validation mode)

Modes:
  full        Run complete QA pipeline (discovery → execution → validation)
  discovery   Only discover assets and governance objects
  execution   Only execute endpoint chains (requires --context)
  validation  Only validate responses (requires --responses)

Environment Variables:
  ATLAN_BASE_URL    Atlan tenant URL (e.g., https://your-tenant.atlan.com)
  ATLAN_API_TOKEN   API token for authentication

Examples:
  # Run full QA with FQN seeds
  node scripts/qa/index.mjs --fqn-csv=/path/to/assets.csv

  # Discovery only
  node scripts/qa/index.mjs --mode=discovery --fqn-csv=/path/to/assets.csv

  # Validate existing responses
  node scripts/qa/index.mjs --mode=validation --responses=./qa-output/response-store.json
`);
}

async function main() {
  const args = parseArgs();
  
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  
  // Validate environment
  if (!process.env.ATLAN_BASE_URL) {
    console.error('Error: ATLAN_BASE_URL environment variable is required');
    console.error('Example: export ATLAN_BASE_URL=https://your-tenant.atlan.com');
    process.exit(1);
  }
  
  if (!process.env.ATLAN_API_TOKEN) {
    console.error('Error: ATLAN_API_TOKEN environment variable is required');
    console.error('Get your API token from Atlan Settings → API Tokens');
    process.exit(1);
  }
  
  // Create orchestrator
  const orchestrator = new QAOrchestrator({
    fqnCsvPath: args.fqnCsvPath,
    maxIterations: args.iterations,
    safeOnly: args.safeOnly,
    outputDir: args.outputDir || path.join(__dirname, '../../src/generated/qa')
  });
  
  try {
    let result;
    
    switch (args.mode) {
      case 'discovery':
        result = await orchestrator.runDiscoveryOnly();
        break;
        
      case 'execution':
        if (!args.contextPath) {
          console.error('Error: --context=PATH is required for execution mode');
          process.exit(1);
        }
        result = await orchestrator.runExecutionOnly(args.contextPath);
        break;
        
      case 'validation':
        if (!args.responsePath) {
          console.error('Error: --responses=PATH is required for validation mode');
          process.exit(1);
        }
        result = await orchestrator.runValidationOnly(args.responsePath);
        break;
        
      case 'full':
      default:
        result = await orchestrator.run();
        break;
    }
    
    // Exit with appropriate code
    if (result.summary?.failedResponses > 0 || result.stats?.invalid > 0) {
      console.log('\n⚠️  QA completed with failures');
      process.exit(1);
    } else {
      console.log('\n✅ QA completed successfully');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('\n❌ QA failed:', error.message);
    console.error(error.stack);
    process.exit(2);
  }
}

main();
