#!/usr/bin/env node
/**
 * Bundle all use-case YAML files into a single JSON for the UI
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USE_CASES_DIR = join(__dirname, '../openapi/use-cases');
const OUTPUT_FILE = join(__dirname, '../src/generated/use-cases-bundled.json');

// Category definitions with icons and order
// Sourced from openapi/use-cases/_index.yaml - don't duplicate here
const CATEGORY_META = {
  'common-actions': { name: 'Common Asset Actions', icon: 'zap', order: 1 },
  'crud': { name: 'Asset CRUD', icon: 'database', order: 2 },
  'search': { name: 'Search', icon: 'search', order: 3 },
  'lineage': { name: 'Lineage', icon: 'git-branch', order: 4 },
  'glossary': { name: 'Glossary', icon: 'book-open', order: 5 },
  'governance': { name: 'Governance', icon: 'shield', order: 6 },
  'data-mesh': { name: 'Data Mesh', icon: 'network', order: 7 },
  'data-contracts': { name: 'Data Contracts', icon: 'file-text', order: 8 },
  'access-control': { name: 'Access Control', icon: 'users', order: 9 },
  'asset-specific': { name: 'Asset-Specific Operations', icon: 'file', order: 10 },
  'workflows': { name: 'Workflows', icon: 'workflow', order: 11 },
};

// Crawler packages are special - group them
const CRAWLER_PACKAGES = new Set([
  'snowflake-crawler', 'snowflake-miner',
  'bigquery-crawler', 'redshift-crawler',
  'databricks-crawler', 'databricks-miner',
  'postgresql-crawler', 'oracle-crawler', 'sqlserver-crawler',
  'athena-crawler', 'glue-crawler', 'dynamodb-crawler',
  'mongodb-crawler', 'kafka-crawler',
  'dbt-crawler',
  'looker-crawler', 'tableau-crawler', 'powerbi-crawler', 'sigma-crawler',
]);

const UTILITY_PACKAGES = new Set([
  'asset-import', 'asset-export',
  'relational-assets-builder', 'lineage-builder',
  'connection-delete',
]);

function loadYamlFile(filepath) {
  try {
    const content = readFileSync(filepath, 'utf8');
    return yaml.load(content);
  } catch (e) {
    console.error(`Error loading ${filepath}:`, e.message);
    return null;
  }
}

function scanDirectory(dirPath) {
  const useCases = [];
  
  if (!existsSync(dirPath)) {
    return useCases;
  }
  
  const files = readdirSync(dirPath, { withFileTypes: true });
  
  for (const file of files) {
    if (file.name.startsWith('_')) continue; // Skip index files
    
    const fullPath = join(dirPath, file.name);
    
    if (file.isDirectory()) {
      useCases.push(...scanDirectory(fullPath));
    } else if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
      const useCase = loadYamlFile(fullPath);
      if (useCase && useCase.id) {
        useCase._sourcePath = fullPath.replace(USE_CASES_DIR, '').slice(1);
        useCases.push(useCase);
      }
    }
  }
  
  return useCases;
}

function categorizeUseCases(useCases) {
  const categories = {};
  
  // Initialize categories
  for (const [id, meta] of Object.entries(CATEGORY_META)) {
    categories[id] = {
      id,
      name: meta.name,
      icon: meta.icon,
      order: meta.order,
      useCases: [],
    };
  }
  
  // Add crawler and utility categories
  categories['crawlers'] = {
    id: 'crawlers',
    name: 'Crawler Packages',
    icon: 'refresh-cw',
    order: 10,
    useCases: [],
  };
  
  categories['utility-packages'] = {
    id: 'utility-packages',
    name: 'Utility Packages',
    icon: 'package',
    order: 11,
    useCases: [],
  };
  
  for (const useCase of useCases) {
    const id = useCase.id;
    
    // Determine category
    let categoryId;
    if (CRAWLER_PACKAGES.has(id)) {
      categoryId = 'crawlers';
    } else if (UTILITY_PACKAGES.has(id)) {
      categoryId = 'utility-packages';
    } else {
      // Extract from source path
      const pathParts = useCase._sourcePath.split('/');
      categoryId = pathParts[0];
    }
    
    if (categories[categoryId]) {
      categories[categoryId].useCases.push(useCase);
    } else {
      console.warn(`Unknown category for ${useCase.id}: ${categoryId}`);
    }
  }
  
  // Sort categories and use cases
  const sortedCategories = Object.values(categories)
    .filter(c => c.useCases.length > 0)
    .sort((a, b) => a.order - b.order);
  
  // Sort use cases within each category alphabetically
  for (const category of sortedCategories) {
    category.useCases.sort((a, b) => a.title.localeCompare(b.title));
  }
  
  return sortedCategories;
}

// Main execution
console.log('Bundling use-cases...');

const useCases = scanDirectory(USE_CASES_DIR);
console.log(`  Found ${useCases.length} use-cases`);

const categories = categorizeUseCases(useCases);
console.log(`  Organized into ${categories.length} categories`);

const output = {
  version: '1.0',
  generatedAt: new Date().toISOString(),
  categories,
  // Also include flat list for search
  useCases: useCases.map(uc => ({
    id: uc.id,
    title: uc.title,
    description: uc.description,
    category: uc.category,
  })),
};

writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
console.log(`\n✓ Wrote ${OUTPUT_FILE}`);

// Print summary
console.log('\nCategories:');
for (const cat of categories) {
  console.log(`  ${cat.name}: ${cat.useCases.length} use-cases`);
}
