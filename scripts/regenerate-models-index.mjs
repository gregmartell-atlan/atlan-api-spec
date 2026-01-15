#!/usr/bin/env node
/**
 * Regenerate the models-index.json from local model files in public/models/
 * 
 * This script reads all JSON files from public/models/ and generates
 * an updated models-index.json for the UI.
 * 
 * Usage:
 *   node scripts/regenerate-models-index.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";

const MODELS_DIR = "public/models";
const INDEX_OUTPUT = "src/generated/models-index.json";

async function main() {
  console.log("=== Regenerate Models Index ===\n");
  
  // Read all JSON files from models directory
  const files = await fs.readdir(MODELS_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  console.log(`Found ${jsonFiles.length} model files`);
  
  const entities = [];
  
  for (const file of jsonFiles) {
    try {
      const filePath = path.join(MODELS_DIR, file);
      const content = await fs.readFile(filePath, 'utf8');
      const model = JSON.parse(content);
      
      const propertyCount = model.properties?.length || 0;
      
      entities.push({
        id: model.id,
        title: model.title,
        propertyCount,
        // Include first 10 property names for search
        searchableProps: model.properties?.slice(0, 10).map(p => p.name) || [],
      });
    } catch (error) {
      console.error(`Error processing ${file}: ${error.message}`);
    }
  }
  
  // Sort by title
  entities.sort((a, b) => a.title.localeCompare(b.title));
  
  const indexData = {
    generatedAt: new Date().toISOString(),
    totalEntities: entities.length,
    totalProperties: entities.reduce((sum, e) => sum + e.propertyCount, 0),
    entities,
  };
  
  // Ensure output directory exists
  await fs.mkdir(path.dirname(INDEX_OUTPUT), { recursive: true });
  
  // Write index
  await fs.writeFile(INDEX_OUTPUT, JSON.stringify(indexData), "utf8");
  
  const indexSize = JSON.stringify(indexData).length;
  
  console.log(`\n=== Summary ===`);
  console.log(`Entities indexed: ${entities.length}`);
  console.log(`Total properties: ${indexData.totalProperties}`);
  console.log(`Index file: ${INDEX_OUTPUT} (${(indexSize / 1024).toFixed(1)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
