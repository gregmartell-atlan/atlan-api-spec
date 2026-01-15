#!/usr/bin/env node
/**
 * Enhance use case descriptions based on title, category, and context
 * 
 * This script adds meaningful descriptions to use cases that have thin or empty descriptions.
 * 
 * Usage:
 *   node scripts/enhance-descriptions.mjs [--dry-run]
 */

import fs from "node:fs/promises";
import path from "node:path";

const USE_CASES_DIR = "openapi/use-cases";

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// Description templates based on title/category patterns
const DESCRIPTION_TEMPLATES = {
  // Access control
  'access-events': `View and audit access events in your Atlan tenant. Access events track when users or service accounts access assets, helping you monitor data usage and maintain compliance.`,
  
  'access-personas': `Manage personas in Atlan. Personas are role-based access control configurations that define what assets a group of users can see and what actions they can perform on those assets.`,
  
  'access-policies': `Manage access policies in Atlan. Policies define granular permissions for assets, including what users or groups can read, write, or administer specific assets or asset types.`,
  
  'access-purposes': `Manage purposes in Atlan. Purposes are access control mechanisms that restrict access to sensitive data based on specific use cases or compliance requirements (e.g., GDPR, PII handling).`,
  
  'access-queries': `Execute queries with proper access controls. This use case covers running queries on assets while respecting the access policies and purposes configured in Atlan.`,
  
  'access-tokens': `Manage API tokens for programmatic access to Atlan. API tokens allow service accounts and automation tools to authenticate and interact with the Atlan API securely.`,
  
  // Users and groups
  'users-groups-create': `Create users and groups in Atlan. Users can be individual accounts, while groups organize users for easier permission management.`,
  
  'users-groups-delete': `Delete users and groups from Atlan. This permanently removes the accounts and any associated access permissions.`,
  
  'users-groups-read': `Retrieve user and group information from Atlan. Query for user details, group memberships, and associated permissions.`,
  
  'users-groups-sso-group-mapping': `Configure SSO group mappings in Atlan. Map identity provider groups to Atlan groups to automatically sync user permissions from your SSO system.`,
  
  'users-groups-update': `Update user and group information in Atlan. Modify user details, group memberships, and associated settings.`,
  
  // Common actions
  'common-examples-announcements': `Manage announcements on assets. Announcements are notices attached to assets to communicate important information like deprecation warnings, data quality issues, or upcoming changes.`,
  
  'common-examples-certificates': `Manage asset certification status. Certificates indicate the quality or trustworthiness of data assets (e.g., Verified, Draft, Deprecated).`,
  
  'common-examples-descriptions': `Manage asset descriptions. Descriptions provide human-readable documentation for assets, helping users understand what data an asset contains and how to use it.`,
  
  'common-examples-custom-metadata': `Attach and manage custom metadata on assets. Custom metadata allows you to extend Atlan's data model with organization-specific attributes.`,
  
  'common-examples-finding': `Find and discover assets in Atlan. Use search and filtering to locate specific assets based on various criteria like name, type, or metadata.`,
  
  'common-examples-finding-examples': `Examples of finding assets using various search patterns and filters. Demonstrates common search scenarios for asset discovery.`,
  
  'common-examples-owners': `Manage asset ownership. Assign users or groups as owners of assets to establish accountability and enable proper governance.`,
  
  'common-examples-relationship-attributes': `Manage relationship attributes between assets. Define and update how assets are connected to each other in the data catalog.`,
  
  // Glossary
  'common-examples-glossary-create': `Create glossary objects in Atlan. Glossaries organize business terms and definitions to ensure consistent data vocabulary across your organization.`,
  
  'common-examples-glossary-categorize-terms': `Categorize glossary terms. Organize terms into categories for better discoverability and logical grouping of related concepts.`,
  
  'common-examples-glossary-create-hierarchy': `Create hierarchical glossary structures. Build parent-child relationships between glossary categories to create organized taxonomies.`,
  
  'common-examples-glossary-hierarchy': `Navigate and traverse glossary hierarchies. Query parent-child relationships between glossary categories and terms.`,
  
  'common-examples-glossary-retrieve-by-name': `Retrieve glossary objects by name. Look up specific glossaries, categories, or terms using their human-readable names.`,
  
  // Lineage
  'common-examples-lineage-manage': `Create and manage data lineage. Lineage tracks how data flows through your organization, connecting source assets to target assets through transformation processes.`,
  
  'common-examples-lineage-parse-sql': `Parse SQL to extract lineage information. Automatically discover data lineage by analyzing SQL queries to identify source and target tables.`,
  
  'common-examples-lineage-traverse': `Traverse lineage graphs. Navigate upstream and downstream lineage to understand data dependencies and impact analysis.`,
  
  // Profiling
  'common-examples-profiling-and-popularity': `Manage profiling and popularity metrics for assets. Profiling captures data statistics while popularity tracks asset usage patterns.`,
  
  'common-examples-profiling-and-popularity-profiling': `Manage column profiling information. Profile data captures statistics like null counts, distinct values, and data distributions for columns.`,
  
  'common-examples-profiling-and-popularity-popularity': `Manage asset popularity metrics. Popularity scores help identify frequently accessed and important data assets.`,
  
  // Data mesh
  'datamesh-datadomains': `Manage data domains in Atlan. Data domains are organizational units in a data mesh architecture that group related data products and define ownership boundaries.`,
  
  'datamesh-dataproducts': `Manage data products in Atlan. Data products are curated, well-documented datasets designed for specific use cases with clear ownership and quality guarantees.`,
  
  // Data contracts
  'datacontract-manage': `Manage data contracts in Atlan. Data contracts define the expected schema, quality rules, and SLAs for data assets, ensuring producers and consumers have clear agreements.`,
  
  'datacontract-manage-via-sdks': `Manage data contracts using the Atlan SDKs. Programmatically create, update, and enforce data contracts across your data ecosystem.`,
  
  // CRUD
  'advanced-examples-create': `Create assets in Atlan. Add new data assets like tables, columns, dashboards, and other catalog objects to the metadata catalog.`,
  
  'advanced-examples-read': `Retrieve assets from Atlan. Query for specific assets by GUID, qualified name, or other identifiers to get their full metadata.`,
  
  'advanced-examples-update': `Update existing assets in Atlan. Modify asset metadata, descriptions, owners, and other properties.`,
  
  'advanced-examples-delete': `Delete assets from Atlan. Remove assets from the catalog, either soft-delete (archive) or hard-delete (permanent removal).`,
  
  'advanced-examples-restore': `Restore deleted assets in Atlan. Recover soft-deleted assets back to active status.`,
  
  'advanced-examples-combine': `Combine multiple asset operations in a single request. Batch create, update, and delete operations for efficient bulk processing.`,
  
  'advanced-examples-history': `View asset change history. Track modifications to assets over time, including who made changes and what was changed.`,
  
  'advanced-examples-search': `Search for assets in Atlan. Use the search API to find assets matching various criteria with support for filtering, sorting, and pagination.`,
  
  'advanced-examples-suggestions': `Find and apply suggestions for assets. Atlan can suggest improvements like better descriptions or missing metadata based on usage patterns.`,
  
  // Search
  'search-logs': `Query search logs in Atlan. Analyze search patterns and user behavior to understand how users discover and access data.`,
  
  // Workflows
  'workflows-manage-workflows': `Manage workflows in Atlan. Workflows are automated pipelines that run crawlers, sync data, and perform scheduled operations on your data catalog.`,
  
  'workflows-manage-schedules': `Manage workflow schedules in Atlan. Configure when and how often workflows run to keep your catalog up to date.`,
};

// Generate a description based on title if no template exists
function generateDescription(id, title, category) {
  // Check for exact match first
  if (DESCRIPTION_TEMPLATES[id]) {
    return DESCRIPTION_TEMPLATES[id];
  }
  
  // Check for pattern matches
  if (id.includes('workflows-packages-')) {
    const connector = title.replace(' assets', '').replace(' miner', ' query history mining');
    return `Configure and run ${connector} workflows. This package crawls metadata from ${connector.split(' ')[0]} and syncs it to your Atlan catalog.`;
  }
  
  // Default based on category
  const categoryDescriptions = {
    'access-control': `Manage access control settings in Atlan.`,
    'common-actions': `Common operations for managing assets in Atlan.`,
    'governance': `Governance operations for managing metadata and classifications in Atlan.`,
    'data-mesh': `Data mesh operations for managing domains and data products.`,
    'data-contracts': `Data contract operations for defining and enforcing data agreements.`,
    'workflows': `Workflow operations for automating catalog synchronization.`,
    'crud': `Asset CRUD operations for creating, reading, updating, and deleting assets.`,
    'search': `Search operations for discovering assets in the catalog.`,
    'lineage': `Lineage operations for tracking data flow and dependencies.`,
    'asset-specific': `Asset-specific operations for particular asset types.`,
    'glossary': `Glossary operations for managing business terminology.`,
  };
  
  return categoryDescriptions[category] || `Manage ${title.toLowerCase()} in Atlan.`;
}

/**
 * Check if a description is thin (needs enhancement)
 */
function isThinDescription(description) {
  if (!description) return true;
  
  // Remove version numbers and SDK references
  const cleaned = description
    .replace(/\d+\.\d+\.\d+/g, '')
    .replace(/SDK/gi, '')
    .trim();
  
  // Check if too short or just contains version info
  if (cleaned.length < 50) return true;
  
  // Check for generic one-liners that just repeat the title
  if (cleaned.split(' ').length < 10) return true;
  
  return false;
}

/**
 * Extract current description from YAML content
 */
function extractDescription(content) {
  const match = content.match(/^description:\s*>-?\n([\s\S]*?)(?=\n\w+:|$)/m);
  if (match) {
    return match[1].trim().replace(/\n\s+/g, ' ');
  }
  return '';
}

/**
 * Extract id, title, category from YAML content
 */
function extractMetadata(content) {
  const idMatch = content.match(/^id:\s*["']?([^"'\n]+)["']?/m);
  const titleMatch = content.match(/^title:\s*["']?([^"'\n]+)["']?/m);
  const categoryMatch = content.match(/^category:\s*["']?([^"'\n]+)["']?/m);
  
  return {
    id: idMatch ? idMatch[1].trim() : '',
    title: titleMatch ? titleMatch[1].trim() : '',
    category: categoryMatch ? categoryMatch[1].trim() : '',
  };
}

/**
 * Update YAML content with new description
 */
function updateDescription(content, newDescription) {
  // Format description for YAML (indent continuation lines)
  const formattedDesc = newDescription
    .split('\n')
    .map((line, i) => i === 0 ? line : '  ' + line)
    .join('\n');
  
  // Replace existing description
  const descPattern = /^description:\s*>-?\n[\s\S]*?(?=\n\w+:)/m;
  const match = content.match(descPattern);
  
  if (match) {
    return content.replace(descPattern, `description: >-\n  ${formattedDesc}\n`);
  }
  
  return content;
}

async function main() {
  console.log('=== Description Enhancement Script ===\n');
  
  if (DRY_RUN) {
    console.log('Running in DRY-RUN mode\n');
  }
  
  // Get all YAML files
  const categories = await fs.readdir(USE_CASES_DIR);
  const yamlFiles = [];
  
  for (const category of categories) {
    if (category.startsWith('_')) continue;
    
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
  
  console.log(`Found ${yamlFiles.length} use case files\n`);
  
  let updated = 0;
  let skipped = 0;
  
  for (const filePath of yamlFiles) {
    const content = await fs.readFile(filePath, 'utf8');
    const filename = path.basename(filePath, '.yaml');
    const metadata = extractMetadata(content);
    const currentDesc = extractDescription(content);
    
    if (isThinDescription(currentDesc)) {
      const newDesc = generateDescription(filename, metadata.title, metadata.category);
      
      if (newDesc && newDesc !== currentDesc) {
        if (DRY_RUN) {
          console.log(`[DRY-RUN] Would update: ${filename}`);
          console.log(`  Current: "${currentDesc.substring(0, 60)}..."`);
          console.log(`  New: "${newDesc.substring(0, 60)}..."\n`);
        } else {
          const updatedContent = updateDescription(content, newDesc);
          await fs.writeFile(filePath, updatedContent, 'utf8');
          console.log(`Updated: ${filename}`);
        }
        updated++;
      } else {
        skipped++;
      }
    } else {
      skipped++;
    }
  }
  
  console.log(`\n=== Summary ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  
  if (!DRY_RUN && updated > 0) {
    console.log('\nRemember to run: node scripts/bundle-use-cases.mjs');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
