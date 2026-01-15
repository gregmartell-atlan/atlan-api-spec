# Atlan API QA System

Automated QA system for generating and validating API responses against the Atlan REST API.

## Overview

This system:
1. **Discovers** assets and governance objects from your Atlan tenant
2. **Executes** chained API calls using discovered values
3. **Validates** responses against expected schemas
4. **Diagnoses** failures and applies self-healing
5. **Exports** responses as OpenAPI examples

## Quick Start

### Prerequisites

Set environment variables:

```bash
export ATLAN_BASE_URL=https://your-tenant.atlan.com
export ATLAN_API_TOKEN=your-api-token
```

### Run Full QA Pipeline

```bash
# With FQN seeds from CSV
npm run qa -- --fqn-csv=/path/to/assets.csv

# Without seeds (discovers assets via search)
npm run qa
```

### Run Individual Phases

```bash
# Discovery only
npm run qa:discover -- --fqn-csv=/path/to/assets.csv

# Execution only (requires previous discovery)
npm run qa -- --mode=execution --context=./src/generated/qa/context-store.json

# Validation only
npm run qa -- --mode=validation --responses=./src/generated/qa/response-store.json
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       QA Orchestrator                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Discovery   │→ │   Executor   │→ │  Validator   │          │
│  │    Agent     │  │    Agent     │  │    Agent     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                ↓                   │                  │
│         ↓          ┌──────────────┐          ↓                  │
│  ┌──────────────┐  │   QA Debug   │  ┌──────────────┐          │
│  │Context Store │← │    Agent     │→ │Response Store│          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### Agents

- **Discovery Agent**: Populates context store with assets, classifications, custom metadata
- **Executor Agent**: Runs endpoint chains using context values
- **Validator Agent**: Validates responses against schemas and business rules
- **QA Debug Agent**: Diagnoses failures and applies healing actions

### Stores

- **Context Store**: GUIDs, FQNs, classifications, custom metadata, domains, terms
- **Response Store**: All captured API responses with metadata

### Configuration

- **Endpoint Chains**: Sequences of API calls that chain together
- **Attribute Sets**: Common attribute lists for different use cases

## FQN CSV Format

The CSV should have a `qualifiedName` column:

```csv
qualifiedName
default/snowflake/123/DATABASE/SCHEMA/TABLE
default/snowflake/123/DATABASE/SCHEMA/TABLE/COLUMN
```

The system automatically classifies FQNs by type (Database, Schema, Table, Column, DataContract, etc.).

## Outputs

Results are written to `src/generated/qa/`:

- `context-store.json` - Discovered assets and governance objects
- `response-store.json` - All captured API responses
- `qa-report.json` - Full execution report
- `openapi-examples.json` - Examples formatted for OpenAPI
- `use-cases/` - Use-case-centric documentation

## Endpoint Chains

The system tests the following endpoint chains:

### Discovery Chains
- `discover-governance` - Classifications, custom metadata, enums
- `discover-domains` - Data domains
- `discover-terms` - Glossary terms

### Asset Chains
- `resolve-fqn-to-guid` - Search by qualifiedName
- `get-full-entity` - GET entity by GUID
- `get-entity-by-unique-attribute` - GET by qualifiedName

### Classification Chains
- `classification-read-operations` - Get classifications on entity
- `classification-write-operations` - Add/remove classifications

### Lineage Chains
- `lineage-operations` - Get lineage in all directions

### Audit Chains
- `audit-operations` - Get entity audit history

### Comprehensive Chains
- `full-asset-inspection` - Complete entity inspection
- `table-full-inspection` - Table with columns and lineage

## Adding New Endpoints

Edit `config/endpoint-chains.mjs`:

```javascript
{
  name: 'my-new-chain',
  description: 'Test new endpoint',
  category: 'custom',
  requires: ['guid'],
  steps: [
    {
      name: 'call-new-endpoint',
      endpoint: 'GET /api/meta/new/{guid}',
      pathParams: { guid: '{guid}' }
    }
  ]
}
```

## CLI Options

```
--help, -h              Show help
--mode=MODE             Execution mode: full, discovery, execution, validation
--fqn-csv=PATH          Path to CSV with FQNs
--iterations=N          Max iterations (default: 3)
--unsafe                Allow destructive operations
--output=PATH           Output directory
--context=PATH          Load context from file
--responses=PATH        Load responses from file
```

## Safe Mode

By default, the system runs in safe mode which:
- Only executes read operations (GET, search)
- Skips chains marked as `isDestructive: true`
- Does not modify any assets

Use `--unsafe` to enable write operations (for testing add/remove classifications, etc.).

## Iterative Healing

The system runs up to 3 iterations:
1. Execute all chains
2. Analyze failures
3. Apply healing actions (refresh stale GUIDs, update typedefs, etc.)
4. Re-run failed chains

This handles common issues like:
- Stale GUIDs from deleted assets
- Rate limiting
- Temporary server errors
