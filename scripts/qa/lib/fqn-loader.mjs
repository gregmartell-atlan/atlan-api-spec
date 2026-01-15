/**
 * FQN Loader
 * 
 * Loads FQNs from CSV files and classifies them by asset type.
 * Parses the qualifiedName structure to determine asset types.
 */

import fs from 'fs';
import path from 'path';

/**
 * Parse a Snowflake-style qualifiedName to determine asset type
 * Format: default/snowflake/{connectionId}/{database}/{schema}/{table}/{column}
 * Or: default/snowflake/{connectionId}/{database}/{schema}/{table}/Table/contract/{version}
 */
export function parseQualifiedName(qualifiedName) {
  const parts = qualifiedName.split('/');
  
  // Basic validation
  if (parts.length < 3) {
    return { type: 'Unknown', parts, depth: parts.length };
  }
  
  // Check for special suffixes
  if (qualifiedName.includes('/Table/contract/')) {
    return {
      type: 'DataContract',
      connector: parts[1],
      connectionId: parts[2],
      database: parts[3],
      schema: parts[4],
      table: parts[5],
      contractVersion: parts[parts.length - 1],
      parts,
      depth: parts.length
    };
  }
  
  if (qualifiedName.includes('/rule/')) {
    return {
      type: 'DQRule',
      connector: parts[1],
      connectionId: parts[2],
      database: parts[3],
      schema: parts[4],
      table: parts[5],
      column: parts[6],
      ruleId: parts[parts.length - 1],
      parts,
      depth: parts.length
    };
  }
  
  // Standard hierarchy: connection/connector/connectionId/database/schema/table/column
  const result = {
    connector: parts[1],
    connectionId: parts[2],
    parts,
    depth: parts.length
  };
  
  switch (parts.length) {
    case 4:
      // Database level
      result.type = 'Database';
      result.database = parts[3];
      break;
    case 5:
      // Schema level
      result.type = 'Schema';
      result.database = parts[3];
      result.schema = parts[4];
      break;
    case 6:
      // Table/View level
      result.type = 'Table'; // Could also be View
      result.database = parts[3];
      result.schema = parts[4];
      result.table = parts[5];
      break;
    case 7:
      // Column level
      result.type = 'Column';
      result.database = parts[3];
      result.schema = parts[4];
      result.table = parts[5];
      result.column = parts[6];
      break;
    default:
      result.type = parts.length > 7 ? 'Nested' : 'Unknown';
  }
  
  return result;
}

/**
 * Load FQNs from a CSV file
 * Expects a CSV with a 'qualifiedName' column header
 */
export function loadFqnsFromCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').map(l => l.trim()).filter(l => l);
  
  // Check if first line is a header
  const hasHeader = lines[0].toLowerCase().includes('qualifiedname') || 
                   lines[0].toLowerCase().includes('qualified_name');
  
  const fqns = hasHeader ? lines.slice(1) : lines;
  
  return fqns.map(fqn => {
    // Handle quoted values
    const cleanFqn = fqn.replace(/^["']|["']$/g, '');
    const parsed = parseQualifiedName(cleanFqn);
    return {
      qualifiedName: cleanFqn,
      ...parsed
    };
  });
}

/**
 * Classify FQNs by type and return categorized results
 */
export function classifyFqns(fqns) {
  const classified = {
    databases: [],
    schemas: [],
    tables: [],
    columns: [],
    dataContracts: [],
    dqRules: [],
    views: [],
    other: []
  };
  
  const typeStats = {};
  
  for (const fqn of fqns) {
    const type = fqn.type;
    typeStats[type] = (typeStats[type] || 0) + 1;
    
    switch (type) {
      case 'Database':
        classified.databases.push(fqn);
        break;
      case 'Schema':
        classified.schemas.push(fqn);
        break;
      case 'Table':
        classified.tables.push(fqn);
        break;
      case 'Column':
        classified.columns.push(fqn);
        break;
      case 'DataContract':
        classified.dataContracts.push(fqn);
        break;
      case 'DQRule':
        classified.dqRules.push(fqn);
        break;
      case 'View':
        classified.views.push(fqn);
        break;
      default:
        classified.other.push(fqn);
    }
  }
  
  return {
    classified,
    typeStats,
    total: fqns.length
  };
}

/**
 * Get unique schema paths from FQNs
 */
export function getUniqueSchemas(fqns) {
  const schemas = new Set();
  
  for (const fqn of fqns) {
    if (fqn.database && fqn.schema) {
      const schemaPath = `${fqn.parts[0]}/${fqn.connector}/${fqn.connectionId}/${fqn.database}/${fqn.schema}`;
      schemas.add(schemaPath);
    }
  }
  
  return Array.from(schemas);
}

/**
 * Get unique table paths from FQNs
 */
export function getUniqueTables(fqns) {
  const tables = new Set();
  
  for (const fqn of fqns) {
    if (fqn.database && fqn.schema && fqn.table) {
      const tablePath = `${fqn.parts[0]}/${fqn.connector}/${fqn.connectionId}/${fqn.database}/${fqn.schema}/${fqn.table}`;
      tables.add(tablePath);
    }
  }
  
  return Array.from(tables);
}

/**
 * Build a hierarchy from FQNs
 */
export function buildHierarchy(fqns) {
  const hierarchy = {};
  
  for (const fqn of fqns) {
    const { connector, connectionId, database, schema, table, column } = fqn;
    
    if (!connector || !connectionId) continue;
    
    const connKey = `${connector}/${connectionId}`;
    if (!hierarchy[connKey]) {
      hierarchy[connKey] = { databases: {} };
    }
    
    if (!database) continue;
    if (!hierarchy[connKey].databases[database]) {
      hierarchy[connKey].databases[database] = { schemas: {} };
    }
    
    if (!schema) continue;
    if (!hierarchy[connKey].databases[database].schemas[schema]) {
      hierarchy[connKey].databases[database].schemas[schema] = { tables: {} };
    }
    
    if (!table) continue;
    if (!hierarchy[connKey].databases[database].schemas[schema].tables[table]) {
      hierarchy[connKey].databases[database].schemas[schema].tables[table] = { 
        columns: [], 
        contracts: [],
        rules: []
      };
    }
    
    if (fqn.type === 'Column' && column) {
      hierarchy[connKey].databases[database].schemas[schema].tables[table].columns.push(column);
    } else if (fqn.type === 'DataContract') {
      hierarchy[connKey].databases[database].schemas[schema].tables[table].contracts.push(fqn.contractVersion);
    } else if (fqn.type === 'DQRule') {
      hierarchy[connKey].databases[database].schemas[schema].tables[table].rules.push(fqn.ruleId);
    }
  }
  
  return hierarchy;
}

/**
 * Print a summary of loaded FQNs
 */
export function printSummary(result) {
  console.log('\n=== FQN Analysis Summary ===\n');
  console.log(`Total FQNs: ${result.total}`);
  console.log('\nType breakdown:');
  
  for (const [type, count] of Object.entries(result.typeStats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
  
  console.log('\nAssets available for testing:');
  console.log(`  Schemas: ${result.classified.schemas.length}`);
  console.log(`  Tables: ${result.classified.tables.length}`);
  console.log(`  Columns: ${result.classified.columns.length}`);
  console.log(`  Data Contracts: ${result.classified.dataContracts.length}`);
  console.log(`  DQ Rules: ${result.classified.dqRules.length}`);
}

/**
 * Load and analyze a CSV file
 */
export function loadAndAnalyze(filePath) {
  console.log(`Loading FQNs from: ${filePath}`);
  const fqns = loadFqnsFromCSV(filePath);
  const result = classifyFqns(fqns);
  printSummary(result);
  return result;
}

export default {
  parseQualifiedName,
  loadFqnsFromCSV,
  classifyFqns,
  getUniqueSchemas,
  getUniqueTables,
  buildHierarchy,
  printSummary,
  loadAndAnalyze
};
