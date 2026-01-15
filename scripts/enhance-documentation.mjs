#!/usr/bin/env node
/**
 * Enhance documentation across all use cases and models
 * 
 * This script:
 * 1. Analyzes all use-case YAML files
 * 2. Determines appropriate relatedTypes based on endpoints, categories, filenames
 * 3. Updates YAML files with relatedTypes
 * 4. Creates missing model files
 * 5. Generates a report of changes
 * 
 * Usage:
 *   node scripts/enhance-documentation.mjs [--dry-run] [--verbose]
 */

import fs from "node:fs/promises";
import path from "node:path";
import {
  ENDPOINT_TYPE_MAPPINGS,
  CATEGORY_TYPE_MAPPINGS,
  FILENAME_TYPE_MAPPINGS,
  MISSING_MODELS,
} from "./config/type-mappings.mjs";

const USE_CASES_DIR = "openapi/use-cases";
const MODELS_DIR = "public/models";

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

function log(...args) {
  console.log(...args);
}

function verbose(...args) {
  if (VERBOSE) console.log('  ', ...args);
}

/**
 * Read and parse a YAML file (simple parser for our use case structure)
 */
async function readYamlFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return { content, filePath };
}

/**
 * Extract key fields from YAML content
 */
function parseYamlBasics(content) {
  const result = {
    id: null,
    title: null,
    category: null,
    description: null,
    relatedTypes: [],
    endpoints: [],
    hasRelatedTypes: false,
  };
  
  // Extract id
  const idMatch = content.match(/^id:\s*["']?([^"'\n]+)["']?/m);
  if (idMatch) result.id = idMatch[1].trim();
  
  // Extract title
  const titleMatch = content.match(/^title:\s*["']?([^"'\n]+)["']?/m);
  if (titleMatch) result.title = titleMatch[1].trim();
  
  // Extract category
  const categoryMatch = content.match(/^category:\s*["']?([^"'\n]+)["']?/m);
  if (categoryMatch) result.category = categoryMatch[1].trim();
  
  // Extract description
  const descMatch = content.match(/^description:\s*>-?\n([\s\S]*?)(?=\n\w+:|$)/m);
  if (descMatch) result.description = descMatch[1].trim();
  
  // Check for existing relatedTypes
  const relatedTypesMatch = content.match(/^relatedTypes:\s*\n((?:\s+-\s+\S+\n?)+)/m);
  if (relatedTypesMatch) {
    result.hasRelatedTypes = true;
    const types = relatedTypesMatch[1].match(/-\s+(\S+)/g);
    if (types) {
      result.relatedTypes = types.map(t => t.replace(/^-\s+/, '').trim());
    }
  }
  
  // Extract all endpoints
  const endpointMatches = content.matchAll(/endpoint:\s*["']?([^"'\n]+)["']?/g);
  for (const match of endpointMatches) {
    result.endpoints.push(match[1].trim());
  }
  
  return result;
}

/**
 * Determine related types for a use case based on multiple signals
 */
function determineRelatedTypes(parsed, filename) {
  const types = new Set();
  
  // 1. Check endpoint patterns
  for (const endpoint of parsed.endpoints) {
    for (const mapping of ENDPOINT_TYPE_MAPPINGS) {
      if (mapping.pattern.test(endpoint)) {
        mapping.types.forEach(t => types.add(t));
      }
    }
  }
  
  // 2. Check category mappings
  const category = parsed.category?.toLowerCase().replace(/\s+/g, '-');
  if (category && CATEGORY_TYPE_MAPPINGS[category]) {
    const categoryMap = CATEGORY_TYPE_MAPPINGS[category];
    
    // Check for specific subcategory matches in filename
    let matched = false;
    for (const [key, typeList] of Object.entries(categoryMap)) {
      if (key !== 'default' && filename.toLowerCase().includes(key)) {
        typeList.forEach(t => types.add(t));
        matched = true;
      }
    }
    
    // Use default if no specific match
    if (!matched && categoryMap.default) {
      categoryMap.default.forEach(t => types.add(t));
    }
  }
  
  // 3. Check filename patterns
  for (const mapping of FILENAME_TYPE_MAPPINGS) {
    if (mapping.pattern.test(filename)) {
      mapping.types.forEach(t => types.add(t));
    }
  }
  
  // 4. Merge with existing relatedTypes if any
  if (parsed.relatedTypes.length > 0) {
    parsed.relatedTypes.forEach(t => types.add(t));
  }
  
  // Remove empty strings and filter out known invalid types
  const invalidTypes = ['AtlanTag']; // Types that don't exist
  const validTypes = Array.from(types).filter(t => t && !invalidTypes.includes(t));
  
  return validTypes.sort();
}

/**
 * Update YAML content with relatedTypes
 */
function updateYamlWithRelatedTypes(content, relatedTypes) {
  if (relatedTypes.length === 0) return content;
  
  const relatedTypesBlock = `relatedTypes:\n${relatedTypes.map(t => `  - ${t}`).join('\n')}`;
  
  // Check if relatedTypes already exists
  const existingMatch = content.match(/^relatedTypes:\s*\n((?:\s+-\s+\S+\n?)+)/m);
  
  if (existingMatch) {
    // Replace existing relatedTypes
    return content.replace(
      /^relatedTypes:\s*\n((?:\s+-\s+\S+\n?)+)/m,
      relatedTypesBlock + '\n'
    );
  } else {
    // Insert after icon line, or after category if no icon
    const iconMatch = content.match(/^icon:\s*.+$/m);
    if (iconMatch) {
      const insertPos = iconMatch.index + iconMatch[0].length;
      return content.slice(0, insertPos) + '\n' + relatedTypesBlock + content.slice(insertPos);
    }
    
    const categoryMatch = content.match(/^category:\s*.+$/m);
    if (categoryMatch) {
      const insertPos = categoryMatch.index + categoryMatch[0].length;
      return content.slice(0, insertPos) + '\n' + relatedTypesBlock + content.slice(insertPos);
    }
  }
  
  return content;
}

/**
 * Check which models exist
 */
async function getExistingModels() {
  const models = new Set();
  try {
    const files = await fs.readdir(MODELS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        models.add(file.replace('.json', '').toLowerCase());
      }
    }
  } catch (e) {
    log('Warning: Could not read models directory');
  }
  return models;
}

/**
 * Create missing model file
 */
async function createMissingModel(modelId, modelDef) {
  const filePath = path.join(MODELS_DIR, `${modelId}.json`);
  
  if (DRY_RUN) {
    log(`  [DRY-RUN] Would create: ${filePath}`);
    return;
  }
  
  await fs.writeFile(filePath, JSON.stringify(modelDef, null, 2), 'utf8');
  log(`  Created: ${filePath}`);
}

/**
 * Process all use case files
 */
async function processUseCases() {
  const report = {
    processed: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    missingModels: new Set(),
    updatedFiles: [],
  };
  
  // Get list of all YAML files
  const categories = await fs.readdir(USE_CASES_DIR);
  const yamlFiles = [];
  
  for (const category of categories) {
    if (category.startsWith('_')) continue; // Skip index files
    
    const categoryPath = path.join(USE_CASES_DIR, category);
    const stat = await fs.stat(categoryPath);
    
    if (stat.isDirectory()) {
      const files = await fs.readdir(categoryPath);
      for (const file of files) {
        if (file.endsWith('.yaml') && !file.startsWith('_')) {
          yamlFiles.push(path.join(categoryPath, file));
        }
      }
    }
  }
  
  log(`Found ${yamlFiles.length} use case files to process\n`);
  
  // Get existing models
  const existingModels = await getExistingModels();
  
  // Process each file
  for (const filePath of yamlFiles) {
    try {
      const { content } = await readYamlFile(filePath);
      const filename = path.basename(filePath);
      const parsed = parseYamlBasics(content);
      
      verbose(`Processing: ${filename}`);
      verbose(`  Category: ${parsed.category}`);
      verbose(`  Endpoints: ${parsed.endpoints.join(', ') || 'none'}`);
      verbose(`  Existing relatedTypes: ${parsed.relatedTypes.join(', ') || 'none'}`);
      
      // Determine related types
      const relatedTypes = determineRelatedTypes(parsed, filename);
      verbose(`  Computed relatedTypes: ${relatedTypes.join(', ') || 'none'}`);
      
      // Check for missing models
      for (const type of relatedTypes) {
        const modelId = type.toLowerCase();
        if (!existingModels.has(modelId)) {
          report.missingModels.add(type);
        }
      }
      
      // Check if update is needed
      const existingTypes = new Set(parsed.relatedTypes.map(t => t.toLowerCase()));
      const newTypes = new Set(relatedTypes.map(t => t.toLowerCase()));
      const needsUpdate = relatedTypes.length > 0 && (
        !parsed.hasRelatedTypes ||
        relatedTypes.length !== parsed.relatedTypes.length ||
        ![...newTypes].every(t => existingTypes.has(t))
      );
      
      if (needsUpdate) {
        const updatedContent = updateYamlWithRelatedTypes(content, relatedTypes);
        
        if (DRY_RUN) {
          log(`[DRY-RUN] Would update: ${filename}`);
          log(`  relatedTypes: ${relatedTypes.join(', ')}`);
        } else {
          await fs.writeFile(filePath, updatedContent, 'utf8');
          log(`Updated: ${filename}`);
          verbose(`  relatedTypes: ${relatedTypes.join(', ')}`);
        }
        
        report.updated++;
        report.updatedFiles.push({ file: filename, types: relatedTypes });
      } else {
        verbose(`  Skipped (no changes needed)`);
        report.skipped++;
      }
      
      report.processed++;
    } catch (error) {
      log(`Error processing ${filePath}: ${error.message}`);
      report.errors.push({ file: filePath, error: error.message });
    }
  }
  
  return report;
}

/**
 * Main function
 */
async function main() {
  log('=== Documentation Enhancement Script ===\n');
  
  if (DRY_RUN) {
    log('Running in DRY-RUN mode (no files will be modified)\n');
  }
  
  // Step 1: Process use cases
  log('Step 1: Processing use cases...\n');
  const report = await processUseCases();
  
  // Step 2: Create missing models
  log('\nStep 2: Checking for missing models...\n');
  
  const existingModels = await getExistingModels();
  const modelsCreated = [];
  
  for (const [modelId, modelDef] of Object.entries(MISSING_MODELS)) {
    if (!existingModels.has(modelId)) {
      await createMissingModel(modelId, modelDef);
      modelsCreated.push(modelId);
    } else {
      verbose(`  Model already exists: ${modelId}`);
    }
  }
  
  // Also check for any types referenced but not in MISSING_MODELS
  for (const type of report.missingModels) {
    const modelId = type.toLowerCase();
    if (!existingModels.has(modelId) && !MISSING_MODELS[modelId]) {
      log(`  Warning: Missing model not in MISSING_MODELS config: ${type}`);
    }
  }
  
  // Summary
  log('\n=== Summary ===\n');
  log(`Use cases processed: ${report.processed}`);
  log(`Use cases updated: ${report.updated}`);
  log(`Use cases skipped: ${report.skipped}`);
  log(`Errors: ${report.errors.length}`);
  log(`Models created: ${modelsCreated.length}`);
  
  if (report.missingModels.size > 0) {
    log(`\nReferenced types without models:`);
    for (const type of report.missingModels) {
      const exists = existingModels.has(type.toLowerCase()) || modelsCreated.includes(type.toLowerCase());
      log(`  - ${type} ${exists ? '(now exists)' : '(MISSING)'}`);
    }
  }
  
  if (report.errors.length > 0) {
    log('\nErrors:');
    for (const { file, error } of report.errors) {
      log(`  ${file}: ${error}`);
    }
  }
  
  if (!DRY_RUN) {
    log('\nDone! Remember to run:');
    log('  node scripts/regenerate-models-index.mjs');
    log('  node scripts/bundle-use-cases.mjs');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
