# Atlan API Spec - Use-Case-Centric Architecture

## Core Principle

**Users think in use cases, not endpoints.**

When someone wants to "tag an asset", they don't care that it uses `POST /api/meta/entity/bulk`. They want to know:
1. What do I need before I start?
2. What API calls do I make, in what order?
3. What does a working example look like?

## Architecture Overview

### 1. Use Case Categories (Tags in OpenAPI)

Each tag represents a **complete use case**, not an endpoint grouping:

```
Tag: "Tag (classify) assets"
├── Description: What this use case accomplishes
├── Prerequisites: What must exist first
├── Steps: Ordered API calls with context
└── Examples: Working code for each step
```

### 2. Endpoint Definitions (Minimal)

Endpoints are defined **once** with:
- Technical parameters
- Request/response schemas
- NO use-case-specific examples

```yaml
# paths/meta/entity-bulk.yaml
post:
  operationId: entityBulk
  summary: Bulk create/update entities
  description: |
    Low-level bulk upsert endpoint. See use-case documentation for specific examples.
  # Minimal - no 50 examples crammed in here
```

### 3. Use Case Flows (New Structure)

Each use case gets its own focused definition:

```yaml
# use-cases/tags/add-tag-to-asset.yaml
title: Add a tag to an asset
description: |
  Tags (classifications) categorize assets. The tag must exist before applying it.
  
prerequisites:
  - Tag must exist in Atlan (create via UI or typedefs API)
  - You need the tag's display name (SDK) or hashed-string ID (raw API)

steps:
  - step: 1
    title: Look up tag hashed-string (Raw API only)
    description: Get the internal hashed-string representation of the tag name.
    endpoint: GET /api/meta/types/typedefs?type=classification
    optional: true
    condition: Only needed for raw REST API - SDK handles this automatically
    example:
      request: null  # GET request
      response: |
        {
          "classificationDefs": [{
            "name": "WCVjmgKnW40G151dESXZ03",
            "displayName": "PII"
          }]
        }
    
  - step: 2
    title: Apply tag to asset
    description: Add the tag using the bulk entity endpoint with append mode.
    endpoint: POST /api/meta/entity/bulk?appendTags=true
    example:
      request: |
        {
          "entities": [{
            "typeName": "Table",
            "attributes": {
              "qualifiedName": "default/snowflake/1234/DB/SCHEMA/TABLE",
              "name": "TABLE"
            },
            "classifications": [{
              "typeName": "WCVjmgKnW40G151dESXZ03"
            }]
          }]
        }
      response: |
        {
          "mutatedEntities": {
            "UPDATE": [...]
          }
        }

tips:
  - Use appendTags=true to add without removing existing tags
  - Tag propagation happens asynchronously as background tasks
  - Tags use internal hashed IDs like "WCVjmgKnW40G151dESXZ03"
```

### 4. Workflow Packages (Complete Flows)

Crawlers and other workflows get complete multi-step documentation:

```yaml
# use-cases/workflows/snowflake-crawler.yaml
title: Snowflake Crawler
description: |
  Crawl Snowflake to ingest metadata into Atlan.

prerequisites:
  - Snowflake connection configured in Atlan
  - Connection admin permissions

steps:
  - step: 1
    title: Find existing workflow (optional)
    description: Check if a Snowflake crawler workflow already exists.
    endpoint: POST /api/service/workflows/indexsearch
    optional: true
    example:
      request: |
        {
          "from": 0,
          "size": 5,
          "query": {
            "bool": {
              "filter": [{
                "nested": {
                  "path": "metadata",
                  "query": {
                    "prefix": {
                      "metadata.name.keyword": {
                        "value": "atlan-snowflake"
                      }
                    }
                  }
                }
              }]
            }
          }
        }

  - step: 2
    title: Submit the crawler workflow
    description: Trigger the Snowflake crawler to run.
    endpoint: POST /api/service/workflows/submit
    example:
      request: |
        {
          "namespace": "default",
          "resourceKind": "WorkflowTemplate",
          "resourceName": "atlan-snowflake-1684500411"
        }

  - step: 3
    title: Monitor workflow run
    description: Check the status of the running workflow.
    endpoint: POST /api/service/runs/indexsearch
    example:
      request: |
        {
          "from": 0,
          "size": 1,
          "query": {
            "bool": {
              "filter": [{
                "nested": {
                  "path": "metadata",
                  "query": {
                    "term": {
                      "metadata.name.keyword": {
                        "value": "atlan-snowflake-1684500411-abc123"
                      }
                    }
                  }
                }
              }]
            }
          }
        }
```

## Implementation Files

```
openapi/
├── openapi.yaml              # Main spec - tags & paths only
├── paths/
│   ├── _index.yaml           # Path references
│   └── meta/
│       ├── entity-bulk.yaml  # MINIMAL - just schema, no examples
│       └── ...
├── components/
│   └── schemas/              # Shared schemas
└── use-cases/                # NEW: Use-case definitions
    ├── _index.yaml           # Use case registry
    ├── common-actions/
    │   ├── certify-assets.yaml
    │   ├── add-tags.yaml
    │   ├── change-owners.yaml
    │   └── ...
    ├── workflows/
    │   ├── snowflake-crawler.yaml
    │   ├── bigquery-crawler.yaml
    │   └── ...
    └── governance/
        ├── create-custom-metadata.yaml
        └── ...
```

## UI Rendering

The UI should:

1. **Sidebar**: Show use-case categories → individual use cases
2. **Main panel**: 
   - Use case title & description
   - Prerequisites
   - Step-by-step flow with expandable examples
   - Tips section
3. **"View raw endpoint"**: Link to see the underlying endpoint details

## Migration Strategy

1. Extract examples from bloated endpoint files
2. Create focused use-case YAML files
3. Slim down endpoint files to just schemas
4. Update UI to render use-case flows
5. Update bundling script to combine everything

## Benefits

- **Clarity**: Users see exactly what they need
- **Maintainability**: Each use case is self-contained
- **Accuracy**: Examples are contextual, not generic
- **Discoverability**: Browse by task, not by endpoint
