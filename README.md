# Atlan REST API OpenAPI Specification

A comprehensive **OpenAPI 3.1.0** specification for Atlan's REST APIs, organized by **use case** rather than flat endpoint lists.

## Features

- 📚 **Use-case organization** – APIs grouped by Common tasks, Asset CRUD, Lineage, Governance, Access control, Workflows
- 🎯 **Interactive Swagger UI** – Browse and try APIs against your tenant
- 📖 **External docs links** – Each operation links back to developer.atlan.com
- 🔐 **Auth ready** – Bearer token and OAuth client credentials documented
- 📝 **Realistic examples** – Request/response examples for each operation
- 🏗️ **Multi-file structure** – Maintainable YAML files bundled for consumption

## Quick Start

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Opens at `http://localhost:3000` with:
- **Swagger UI Explorer** – Interactive API documentation
- **Legacy Generator** – Generate spec from your tenant's live data

### Build for Production

```bash
npm run build
```

## OpenAPI Specification

### Structure

```
openapi/
├── openapi.yaml              # Main entry (info, servers, tags, refs)
├── components/
│   ├── security.yaml         # AtlanToken, AtlanOAuthClient
│   ├── schemas/
│   │   ├── _index.yaml       # Schema index
│   │   ├── Asset.yaml        # Generic asset model
│   │   ├── AssetMutation.yaml
│   │   ├── Search.yaml
│   │   ├── Lineage.yaml
│   │   ├── ErrorResponse.yaml
│   │   └── TypeDefs.yaml
│   └── parameters/
│       └── _index.yaml       # Reusable parameters
└── paths/
    ├── _index.yaml           # Path index
    ├── meta/                 # /api/meta/* endpoints
    │   ├── entity-bulk.yaml
    │   ├── entity-guid.yaml
    │   ├── search-indexsearch.yaml
    │   ├── lineage-list.yaml
    │   ├── types-typedefs.yaml
    │   └── ...
    └── service/              # /api/service/* endpoints
        ├── workflows-indexsearch.yaml
        ├── runs-indexsearch.yaml
        └── health.yaml
```

### Commands

```bash
# Bundle multi-file YAML into single JSON for Swagger UI
npm run bundle:openapi

# Lint the OpenAPI spec (uses @redocly/cli)
npm run lint:openapi

# Generate spec from developer.atlan.com (crawler)
npm run generate:atlan-openapi
```

### Output Files

- `src/generated/atlan-openapi-bundled.json` – Bundled spec for Swagger UI
- `src/generated/atlan-openapi.json` – Crawler-generated spec (legacy)

## Use-Case Tags

Operations are tagged by task/use case. This specification now includes **100+ documented use cases** organized into the following categories:

### Common Tasks
- Certify assets, Manage announcements, Change description, Change owners
- Manage tags, Manage custom metadata, Link terms, Link domains
- Manage READMEs, Add resources, Manage relationships

### Asset CRUD
- Create assets, Retrieve assets, Update assets, Delete assets
- Restore assets, Review changes, Search assets, Bulk updates

### Lineage
- Lineage – Manage, Lineage – Traverse

### Governance
- Custom metadata structures, Options (enumerations), Badges
- Tags (Atlan tags), Data domains, Data products, Data contracts

### Access Control
- Personas, Purposes, Policies, Access events, API tokens
- Users, Groups, SSO group mapping

### Workflows
- Workflows, Workflow runs, Workflow schedules

### Reference
- Searching, Events, Types

### Asset-Specific
- Relational assets, Glossary assets, API assets, BI assets
- Object store assets, AI assets, Data quality assets

### MDLH Plug & Play Use Cases
Ready-to-deploy solutions that deliver immediate business value:
- **Metadata Completeness**: Track enrichment coverage across asset types
- **Lineage & Impact Analysis**: Impact analysis, root cause analysis, lineage export
- **Compliance & Tag Analysis**: Compliance reports, PII/sensitive data tracking
- **Database Cost Analysis**: Identify expensive queries and optimize costs
- **Glossary Management**: Export, reporting, and bi-directional sync
- **Metadata Export**: Power data marketplace, AI context, change monitoring

### Custom Packages & Solutions
Pre-built packages for common integration patterns:
- **Asset Management**: Import, export, enrichment migration, bulk builders
- **Lineage Management**: Lineage builders, generators, Power BI, BigQuery, custom miners
- **Metadata Propagation**: Jira, descriptions, tags, alerts propagation
- **Metadata Reporting**: Duplicate detection, impact reports, admin/adoption exports

### Data Discovery & Cataloging
- Custom source cataloging, Non-native system integration
- Business apps cataloging, Quick discovery, Curated data products
- Collaborative data exploration

### Data Quality & Monitoring
- Data Quality Studio (Snowflake, Databricks)
- AI-suggested quality rules, Real-time monitoring
- Custom quality metrics

### Active Metadata & Automation
- Automated documentation (Atlan AI)
- Tag propagation workflows
- Metadata enrichment automation
- Webhook-based automation

### Analytics & Reporting
- Metadata reporting for compliance
- Talk to Data (AI-driven metadata access)
- API/SDK heavy operations
- Data marketplace integration

### Migration & Transformation
- Alation to Atlan migration
- Cross-platform metadata migration
- Enrichment preservation during migration

### Data Mesh & Data Products
- Data product creation and management
- Business lineage for data products
- Domain-driven data organization

### Integration & Collaboration
- Microsoft Teams integration
- Slack integration
- Link conversations to datasets
- Share data assets across teams
- Cross-tenant asset migration

### Custom Development
- Application SDK for custom apps
- Extend platform capabilities
- Create custom integrations and automations

## Authentication

All endpoints require Bearer token authentication:

```bash
curl -X POST "https://your-tenant.atlan.com/api/meta/search/indexsearch" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dsl":{"query":{"match_all":{}}}}'
```

Get your API token from **Atlan Settings → API Tokens**.

## Servers

The spec is tenant-agnostic:

```yaml
servers:
  - url: https://{tenant}.atlan.com
    variables:
      tenant:
        default: your-tenant
```

## Error Handling

All operations use a standard error envelope:

```json
{
  "errorCode": "ATLAS-403-00-001",
  "errorMessage": "Access denied: insufficient permissions",
  "errorCause": null
}
```

## Contributing

1. Edit YAML files in `openapi/`
2. Run `npm run lint:openapi` to validate
3. Run `npm run bundle:openapi` to generate bundled JSON
4. Run `npm run dev` to preview in Swagger UI

## Source of Truth

This spec re-expresses the documentation at [developer.atlan.com](https://developer.atlan.com) in machine-readable form. The authoritative source remains the developer docs and SDKs.

## License

MIT
