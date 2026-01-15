#!/usr/bin/env node
/**
 * Generate use-case YAML files for all crawler packages
 * Each crawler follows the same multi-step pattern
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USE_CASES_DIR = join(__dirname, '../openapi/use-cases/workflows');

// Crawler definitions
const CRAWLERS = [
  {
    id: 'snowflake-miner',
    title: 'Snowflake Miner',
    workflowPrefix: 'atlan-snowflake-miner',
    description: 'Mine Snowflake query history to extract lineage and popularity data.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/snowflake-miner/',
    connector: 'Snowflake',
    category: 'Data Warehouse',
    extraConfig: [
      { name: 'Query history days', description: 'Number of days of query history to analyze' },
      { name: 'Lineage extraction', description: 'Extract column-level lineage from SQL' },
    ],
  },
  {
    id: 'bigquery-crawler',
    title: 'BigQuery Crawler',
    workflowPrefix: 'atlan-bigquery',
    description: 'Crawl Google BigQuery to ingest datasets, tables, views, and column metadata.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/bigquery-assets/',
    connector: 'BigQuery',
    category: 'Data Warehouse',
  },
  {
    id: 'redshift-crawler',
    title: 'Redshift Crawler',
    workflowPrefix: 'atlan-redshift',
    description: 'Crawl Amazon Redshift to ingest database, schema, table, and column metadata.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/redshift-assets/',
    connector: 'Redshift',
    category: 'Data Warehouse',
  },
  {
    id: 'databricks-crawler',
    title: 'Databricks Crawler',
    workflowPrefix: 'atlan-databricks',
    description: 'Crawl Databricks Unity Catalog to ingest catalogs, schemas, tables, and columns.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/databricks-assets/',
    connector: 'Databricks',
    category: 'Data Lakehouse',
  },
  {
    id: 'databricks-miner',
    title: 'Databricks Miner',
    workflowPrefix: 'atlan-databricks-lineage',
    description: 'Mine Databricks query history to extract lineage and usage data.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/databricks-miner/',
    connector: 'Databricks',
    category: 'Data Lakehouse',
    extraConfig: [
      { name: 'Query history days', description: 'Number of days of query history to analyze' },
    ],
  },
  {
    id: 'postgresql-crawler',
    title: 'PostgreSQL Crawler',
    workflowPrefix: 'atlan-postgres',
    description: 'Crawl PostgreSQL to ingest database, schema, table, and column metadata.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/postgres-assets/',
    connector: 'PostgreSQL',
    category: 'Database',
  },
  {
    id: 'oracle-crawler',
    title: 'Oracle Crawler',
    workflowPrefix: 'atlan-oracle',
    description: 'Crawl Oracle Database to ingest schemas, tables, views, and columns.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/oracle-assets/',
    connector: 'Oracle',
    category: 'Database',
  },
  {
    id: 'sqlserver-crawler',
    title: 'SQL Server Crawler',
    workflowPrefix: 'atlan-mssql',
    description: 'Crawl Microsoft SQL Server to ingest databases, schemas, tables, and columns.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/sql-server-assets/',
    connector: 'SQL Server',
    category: 'Database',
  },
  {
    id: 'athena-crawler',
    title: 'Athena Crawler',
    workflowPrefix: 'atlan-athena',
    description: 'Crawl Amazon Athena to ingest catalogs, databases, tables, and columns.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/athena-assets/',
    connector: 'Athena',
    category: 'AWS',
  },
  {
    id: 'glue-crawler',
    title: 'AWS Glue Crawler',
    workflowPrefix: 'atlan-glue',
    description: 'Crawl AWS Glue Data Catalog to ingest databases, tables, and columns.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/glue-assets/',
    connector: 'AWS Glue',
    category: 'AWS',
  },
  {
    id: 'dynamodb-crawler',
    title: 'DynamoDB Crawler',
    workflowPrefix: 'atlan-dynamodb',
    description: 'Crawl Amazon DynamoDB to ingest tables and their attributes.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/dynamodb-assets/',
    connector: 'DynamoDB',
    category: 'AWS',
  },
  {
    id: 'mongodb-crawler',
    title: 'MongoDB Crawler',
    workflowPrefix: 'atlan-mongodb',
    description: 'Crawl MongoDB to ingest databases, collections, and fields.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/mongodb-assets/',
    connector: 'MongoDB',
    category: 'NoSQL',
  },
  {
    id: 'kafka-crawler',
    title: 'Kafka Crawler',
    workflowPrefix: 'atlan-kafka-confluent-cloud',
    description: 'Crawl Confluent Kafka to ingest topics and schema registry information.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/confluent-kafka-assets/',
    connector: 'Kafka (Confluent)',
    category: 'Streaming',
  },
  {
    id: 'dbt-crawler',
    title: 'dbt Crawler',
    workflowPrefix: 'atlan-dbt',
    description: 'Crawl dbt to ingest models, sources, tests, and lineage.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/dbt-assets/',
    connector: 'dbt',
    category: 'Transformation',
  },
  {
    id: 'looker-crawler',
    title: 'Looker Crawler',
    workflowPrefix: 'atlan-looker',
    description: 'Crawl Looker to ingest projects, models, explores, views, and dashboards.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/looker-assets/',
    connector: 'Looker',
    category: 'BI Tool',
  },
  {
    id: 'tableau-crawler',
    title: 'Tableau Crawler',
    workflowPrefix: 'atlan-tableau',
    description: 'Crawl Tableau to ingest workbooks, dashboards, sheets, and data sources.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/tableau-assets/',
    connector: 'Tableau',
    category: 'BI Tool',
  },
  {
    id: 'powerbi-crawler',
    title: 'Power BI Crawler',
    workflowPrefix: 'atlan-powerbi',
    description: 'Crawl Power BI to ingest workspaces, reports, dashboards, and datasets.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/powerbi-assets/',
    connector: 'Power BI',
    category: 'BI Tool',
  },
  {
    id: 'sigma-crawler',
    title: 'Sigma Crawler',
    workflowPrefix: 'atlan-sigma',
    description: 'Crawl Sigma Computing to ingest workbooks, pages, and datasets.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/sigma-assets/',
    connector: 'Sigma',
    category: 'BI Tool',
  },
];

// Utility packages
const UTILITY_PACKAGES = [
  {
    id: 'asset-import',
    title: 'Asset Import',
    workflowPrefix: 'csa-asset-import',
    description: 'Bulk import assets from CSV or other file formats.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/asset-import/',
    category: 'Utility',
  },
  {
    id: 'asset-export',
    title: 'Asset Export',
    workflowPrefix: 'csa-asset-export-basic',
    description: 'Export assets to CSV for reporting or external processing.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/asset-export-basic/',
    category: 'Utility',
  },
  {
    id: 'relational-assets-builder',
    title: 'Relational Assets Builder',
    workflowPrefix: 'csa-relational-assets-builder',
    description: 'Build relational database assets programmatically from structured input.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/relational-assets-builder/',
    category: 'Utility',
  },
  {
    id: 'lineage-builder',
    title: 'Lineage Builder',
    workflowPrefix: 'csa-lineage-builder',
    description: 'Create arbitrary lineage connections between any assets.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/lineage-builder/',
    category: 'Utility',
  },
  {
    id: 'connection-delete',
    title: 'Connection Delete',
    workflowPrefix: 'atlan-connection-delete',
    description: 'Delete a connection and all its associated assets.',
    docUrl: 'https://developer.atlan.com/snippets/workflows/packages/connection-delete/',
    category: 'Utility',
    warning: 'This is a destructive operation. All assets in the connection will be permanently deleted.',
  },
];

function generateCrawlerYaml(crawler) {
  const isMiner = crawler.id.includes('miner');
  const assetType = isMiner ? 'lineage and usage data' : 'metadata';
  
  return `# Use Case: ${crawler.title}
# Complete multi-step workflow for ${isMiner ? 'mining' : 'crawling'} ${crawler.connector}

id: ${crawler.id}
title: ${crawler.title}
category: Crawler Packages
icon: refresh-cw

description: |
  ${crawler.description}

externalDocs:
  url: ${crawler.docUrl}
  description: ${crawler.title} documentation

prerequisites:
  - title: ${crawler.connector} connection configured
    description: A ${crawler.connector} connection must be set up in Atlan with valid credentials.
    howTo: Create via Atlan UI (Admin > Connections > New Connection > ${crawler.connector})
  - title: Connection admin permissions
    description: You need admin access to the connection to run ${isMiner ? 'miners' : 'crawlers'}.

steps:
  - step: 1
    title: Find existing ${crawler.title.toLowerCase()} workflow
    description: |
      Check if a ${crawler.title.toLowerCase()} workflow already exists for your connection.
      The workflow name follows the pattern \`${crawler.workflowPrefix}-{timestamp}\`.
    method: POST
    endpoint: /api/service/workflows/indexsearch
    optional: true
    condition: Skip if you already know the workflow resourceName
    example:
      summary: Search for ${crawler.title.toLowerCase()} workflows
      request:
        from: 0
        size: 10
        track_total_hits: true
        query:
          bool:
            filter:
              - nested:
                  path: metadata
                  query:
                    prefix:
                      metadata.name.keyword:
                        value: ${crawler.workflowPrefix}
        sort:
          - metadata.creationTimestamp:
              order: desc
              nested:
                path: metadata

  - step: 2
    title: Submit the ${isMiner ? 'miner' : 'crawler'} workflow
    description: |
      Trigger the ${crawler.title.toLowerCase()} to run. This starts an asynchronous job
      that ${isMiner ? 'mines query history from' : 'crawls'} your ${crawler.connector} instance.
    method: POST
    endpoint: /api/service/workflows/submit
    example:
      summary: Run an existing ${crawler.title.toLowerCase()}
      request:
        namespace: default
        resourceKind: WorkflowTemplate
        resourceName: ${crawler.workflowPrefix}-1684500411
      response:
        metadata:
          name: ${crawler.workflowPrefix}-1684500411-run-abc123
          namespace: default
        status:
          phase: Running

  - step: 3
    title: Monitor workflow run status
    description: |
      Check the status of the running workflow.
    method: POST
    endpoint: /api/service/runs/indexsearch
    example:
      summary: Check run status
      request:
        from: 0
        size: 1
        query:
          bool:
            filter:
              - nested:
                  path: metadata
                  query:
                    prefix:
                      metadata.name.keyword:
                        value: ${crawler.workflowPrefix}-1684500411
        sort:
          - metadata.creationTimestamp:
              order: desc
              nested:
                path: metadata

tips:
  - title: Workflow naming
    content: |
      Workflow names follow: \`${crawler.workflowPrefix}-{timestamp}\`
  - title: Run scheduling
    content: |
      Configure run schedules via the Atlan UI to automatically ${isMiner ? 'mine' : 'crawl'} on a cadence.

relatedUseCases:
  - id: manage-workflows
    title: Manage workflows
  - id: workflow-runs
    title: Monitor workflow runs
`;
}

function generateUtilityYaml(pkg) {
  return `# Use Case: ${pkg.title}
# ${pkg.description}

id: ${pkg.id}
title: ${pkg.title}
category: Utility Packages
icon: package

description: |
  ${pkg.description}
${pkg.warning ? `\n  ⚠️ **Warning:** ${pkg.warning}` : ''}

externalDocs:
  url: ${pkg.docUrl}
  description: ${pkg.title} documentation

prerequisites:
  - title: Package must be configured
    description: The ${pkg.title.toLowerCase()} package must be set up in Atlan.
    howTo: Configure via Atlan UI (Admin > Packages)

steps:
  - step: 1
    title: Find existing ${pkg.title.toLowerCase()} workflow
    description: |
      Check if a ${pkg.title.toLowerCase()} workflow already exists.
      The workflow name follows the pattern \`${pkg.workflowPrefix}-{timestamp}\`.
    method: POST
    endpoint: /api/service/workflows/indexsearch
    optional: true
    example:
      summary: Search for ${pkg.title.toLowerCase()} workflows
      request:
        from: 0
        size: 10
        query:
          bool:
            filter:
              - nested:
                  path: metadata
                  query:
                    prefix:
                      metadata.name.keyword:
                        value: ${pkg.workflowPrefix}
        sort:
          - metadata.creationTimestamp:
              order: desc
              nested:
                path: metadata

  - step: 2
    title: Submit the workflow
    description: |
      Trigger the ${pkg.title.toLowerCase()} workflow to run.
    method: POST
    endpoint: /api/service/workflows/submit
    example:
      summary: Run ${pkg.title.toLowerCase()}
      request:
        namespace: default
        resourceKind: WorkflowTemplate
        resourceName: ${pkg.workflowPrefix}-1684500411

  - step: 3
    title: Monitor workflow run status
    description: |
      Check the status of the running workflow.
    method: POST
    endpoint: /api/service/runs/indexsearch
    example:
      summary: Check run status
      request:
        from: 0
        size: 1
        query:
          bool:
            filter:
              - nested:
                  path: metadata
                  query:
                    prefix:
                      metadata.name.keyword:
                        value: ${pkg.workflowPrefix}-1684500411
        sort:
          - metadata.creationTimestamp:
              order: desc
              nested:
                path: metadata

relatedUseCases:
  - id: manage-workflows
    title: Manage workflows
  - id: workflow-runs
    title: Monitor workflow runs
`;
}

// Generate all files
console.log('Generating crawler use-case files...');

for (const crawler of CRAWLERS) {
  // Skip snowflake-crawler since we already have a detailed one
  if (crawler.id === 'snowflake-crawler') continue;
  
  const filename = `${crawler.id}.yaml`;
  const filepath = join(USE_CASES_DIR, filename);
  const content = generateCrawlerYaml(crawler);
  
  writeFileSync(filepath, content);
  console.log(`  ✓ ${filename}`);
}

console.log('\nGenerating utility package use-case files...');

for (const pkg of UTILITY_PACKAGES) {
  const filename = `${pkg.id}.yaml`;
  const filepath = join(USE_CASES_DIR, filename);
  const content = generateUtilityYaml(pkg);
  
  writeFileSync(filepath, content);
  console.log(`  ✓ ${filename}`);
}

console.log('\nDone! Generated use-case files for:');
console.log(`  - ${CRAWLERS.length} crawlers`);
console.log(`  - ${UTILITY_PACKAGES.length} utility packages`);
