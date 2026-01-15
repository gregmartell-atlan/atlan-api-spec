import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Search,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Copy,
  Check,
  Play,
  X,
  FileJson,
  BookOpen,
  Zap,
  Shield,
  GitBranch,
  Database,
  Settings,
  Users,
  Workflow,
  Layers,
  BarChart3,
  Package,
  FileSearch,
  RefreshCw,
  Network,
  Code2,
} from 'lucide-react';

import spec from '../generated/atlan-openapi-bundled.json';

// Types
interface Operation {
  operationId: string;
  summary: string;
  description?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
  externalDocs?: { url: string; description?: string };
  security?: Record<string, string[]>[];
}

interface Parameter {
  name: string;
  in: string;
  required?: boolean;
  schema?: Schema;
  description?: string;
  example?: unknown;
}

interface Schema {
  type?: string;
  format?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  $ref?: string;
  example?: unknown;
  description?: string;
  enum?: string[];
  default?: unknown;
  additionalProperties?: boolean | Schema;
}

interface RequestBody {
  required?: boolean;
  content?: Record<
    string,
    {
      schema?: Schema;
      example?: unknown;
      examples?: Record<
        string,
        {
          summary?: string;
          description?: string;
          value?: unknown;
          // Vendor extension: raw snippet text from developer docs (may include // comments)
          'x-atlanSnippet'?: string;
          // Vendor extension: link to the exact docs section the snippet came from
          'x-docUrl'?: string;
          // Vendor extension: use-case tag for filtering examples
          'x-useCaseTag'?: string;
        }
      >;
    }
  >;
}

interface Response {
  description?: string;
  content?: Record<string, { schema?: Schema; example?: unknown }>;
}

interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  [key: string]: Operation | undefined;
}

interface TagInfo {
  name: string;
  description?: string;
  externalDocs?: { url: string; description?: string };
}

// Use-case hierarchy - updated to match extracted examples from developer.atlan.com
const USE_CASE_GROUPS = [
  {
    id: 'common-actions',
    name: 'Common Asset Actions',
    icon: Zap,
    tags: [
      'Certify assets',
      'Manage announcements',
      'Change description',
      'Change owners',
      'Tag (classify) assets',
      'Change custom metadata',
      'Link terms to assets',
      'Link domains to assets',
      'Manage asset READMEs',
      'Add asset resources',
      'Manage relationships',
    ],
  },
  {
    id: 'crud',
    name: 'Asset CRUD',
    icon: Database,
    tags: [
      'Create assets',
      'Retrieve assets',
      'Update assets',
      'Delete assets',
      'Restore assets',
      'Review audit history',
      'Combine operations',
    ],
  },
  {
    id: 'search',
    name: 'Search',
    icon: FileSearch,
    tags: [
      'Search assets',
      'Search examples',
      'Search logs',
    ],
  },
  {
    id: 'lineage',
    name: 'Lineage',
    icon: GitBranch,
    tags: [
      'Manage lineage',
      'Traverse lineage',
      'Parse SQL for lineage',
    ],
  },
  {
    id: 'glossary',
    name: 'Glossary',
    icon: BookOpen,
    tags: [
      'Create glossary objects',
      'Retrieve glossary by name',
      'Create glossary hierarchy',
      'Categorize glossary terms',
      'Traverse glossary hierarchy',
    ],
  },
  {
    id: 'data-mesh',
    name: 'Data Mesh',
    icon: Network,
    tags: [
      'Manage Data Domains',
      'Manage Data Products',
    ],
  },
  {
    id: 'custom-metadata',
    name: 'Custom Metadata',
    icon: Settings,
    tags: [
      'Create custom metadata',
      'Read custom metadata',
      'Update custom metadata',
      'Delete custom metadata',
      'Custom metadata badges',
      'Custom metadata enums',
    ],
  },
  {
    id: 'tags',
    name: 'Tag Definitions',
    icon: Shield,
    tags: [
      'Manage tag definitions',
      'Monitor tag propagation',
    ],
  },
  {
    id: 'data-contracts',
    name: 'Data Contracts',
    icon: FileJson,
    tags: [
      'Data contracts via SDKs',
    ],
  },
  {
    id: 'profiling',
    name: 'Profiling & Popularity',
    icon: BarChart3,
    tags: [
      'Profiling',
      'Popularity',
    ],
  },
  {
    id: 'access',
    name: 'Access Control',
    icon: Users,
    tags: [
      'Manage personas',
      'Manage purposes',
      'Manage policies',
      'Access events',
      'Manage API tokens',
      'Query access logs',
    ],
  },
  {
    id: 'users-groups',
    name: 'Users & Groups',
    icon: Users,
    tags: [
      'Create users & groups',
      'Read users & groups',
      'Update users & groups',
      'Delete users & groups',
      'SSO group mapping',
    ],
  },
  {
    id: 'workflows',
    name: 'Workflows',
    icon: Workflow,
    tags: [
      'Manage workflows',
      'Workflow runs',
      'Workflow schedules',
    ],
  },
  {
    id: 'crawlers',
    name: 'Crawler Packages',
    icon: RefreshCw,
    tags: [
      'Snowflake crawler',
      'Snowflake miner',
      'BigQuery crawler',
      'Redshift crawler',
      'Databricks crawler',
      'Databricks miner',
      'PostgreSQL crawler',
      'Oracle crawler',
      'SQL Server crawler',
      'Athena crawler',
      'AWS Glue crawler',
      'DynamoDB crawler',
      'MongoDB crawler',
      'Kafka crawler',
      'dbt crawler',
      'Looker crawler',
      'Tableau crawler',
      'Power BI crawler',
      'Sigma crawler',
    ],
  },
  {
    id: 'utility-packages',
    name: 'Utility Packages',
    icon: Package,
    tags: [
      'Asset import',
      'Asset export',
      'Relational assets builder',
      'Lineage builder',
      'Lineage generator (no transformation)',
      'Fivetran enrichment',
      'Connection delete',
      'API token connection admin',
    ],
  },
  {
    id: 'files',
    name: 'Files',
    icon: Layers,
    tags: [
      'File operations',
    ],
  },
];

// Multi-step workflow definitions for complex use cases
interface WorkflowStep {
  step: number;
  title: string;
  description: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint?: string;
  optional?: boolean;
  condition?: string;
}

interface WorkflowDefinition {
  tag: string;
  title: string;
  description: string;
  prerequisites?: string[];
  steps: WorkflowStep[];
  tips?: string[];
}

const WORKFLOW_DEFINITIONS: WorkflowDefinition[] = [
  {
    tag: 'Tag (classify) assets',
    title: 'Adding a Tag to an Asset',
    description: 'Tags (classifications) can be applied to assets to categorize them. The tag must exist before you can apply it.',
    prerequisites: [
      'Tag must already exist in Atlan (create via UI or API first)',
      'You need either the tag\'s display name (SDK) or hashed-string ID (raw API)',
    ],
    steps: [
      {
        step: 1,
        title: 'Look up tag hashed-string (Raw API only)',
        description: 'Get the internal hashed-string representation of the tag name.',
        method: 'GET',
        endpoint: '/api/meta/types/typedefs?type=classification',
        optional: true,
        condition: 'Only needed for raw REST API - SDK handles this automatically',
      },
      {
        step: 2,
        title: 'Apply tag to asset',
        description: 'Add the tag using the bulk entity endpoint with append mode.',
        method: 'POST',
        endpoint: '/api/meta/entity/bulk?appendTags=true',
      },
    ],
    tips: [
      'Use appendTags=true to add without removing existing tags',
      'Tag propagation happens asynchronously as background tasks',
      'Tags use internal hashed IDs like "WCVjmgKnW40G151dESXZ03"',
    ],
  },
  {
    tag: 'Manage asset READMEs',
    title: 'Working with Asset READMEs',
    description: 'READMEs are separate assets linked to the parent asset. Retrieving requires including the relationship.',
    prerequisites: [
      'Parent asset must exist before adding a README',
    ],
    steps: [
      {
        step: 1,
        title: 'Retrieve asset with README',
        description: 'Search for the asset and include the README relationship in results.',
        method: 'POST',
        endpoint: '/api/meta/search/indexsearch',
      },
      {
        step: 2,
        title: 'Create or update README',
        description: 'README is created as a separate asset type linked to the parent.',
        method: 'POST',
        endpoint: '/api/meta/entity/bulk',
        optional: true,
        condition: 'Only if creating/updating the README content',
      },
    ],
    tips: [
      'README content is stored as URL-encoded HTML',
      'Use the README\'s GUID (not the parent asset\'s) for direct retrieval',
      'Include "Readme.DESCRIPTION" in relations when searching',
    ],
  },
  {
    tag: 'Link terms to assets',
    title: 'Linking Glossary Terms to Assets',
    description: 'Associate glossary terms with assets. The SDK handles appending automatically; raw API requires care.',
    prerequisites: [
      'Glossary term must already exist',
    ],
    steps: [
      {
        step: 1,
        title: 'Retrieve existing terms (Raw API only)',
        description: 'Get the asset\'s current terms to append to (not replace).',
        method: 'GET',
        endpoint: '/api/meta/entity/guid/{guid}',
        optional: true,
        condition: 'Only needed for raw API when appending - SDK handles automatically',
      },
      {
        step: 2,
        title: 'Link term to asset',
        description: 'Update the asset with the term reference in the meanings array.',
        method: 'POST',
        endpoint: '/api/meta/entity/bulk',
      },
    ],
    tips: [
      'Terms can be referenced by GUID or qualifiedName',
      'Response includes both the updated asset and term',
      'Use the SDK for automatic append handling',
    ],
  },
  {
    tag: 'Change custom metadata',
    title: 'Setting Custom Metadata on Assets',
    description: 'Custom metadata structures must exist before setting values. Use GUID-based endpoint for partial updates.',
    prerequisites: [
      'Custom metadata structure must exist in Atlan',
      'You need the asset\'s GUID (not qualifiedName)',
    ],
    steps: [
      {
        step: 1,
        title: 'Look up custom metadata structure',
        description: 'Get the hashed-string name of the custom metadata.',
        method: 'GET',
        endpoint: '/api/meta/types/typedefs?type=business_metadata',
        optional: true,
        condition: 'Only if you don\'t know the hashed-string name',
      },
      {
        step: 2,
        title: 'Update custom metadata',
        description: 'Set values on specific attributes without affecting others.',
        method: 'POST',
        endpoint: '/api/meta/entity/guid/{guid}/businessmetadata?isOverwrite=false',
      },
    ],
    tips: [
      'Use isOverwrite=false to update only specified attributes',
      'Multi-valued attributes must be wrapped in arrays',
      'No response body - retrieve asset separately to confirm',
    ],
  },
  {
    tag: 'Manage lineage',
    title: 'Creating Lineage Relationships',
    description: 'Lineage is created by making a Process entity that connects input and output assets.',
    prerequisites: [
      'Both input and output assets must already exist',
      'A connection must exist for the process',
    ],
    steps: [
      {
        step: 1,
        title: 'Create Process entity',
        description: 'Create a Process (asset-level) or ColumnProcess (column-level) with inputs and outputs.',
        method: 'POST',
        endpoint: '/api/meta/entity/bulk',
      },
    ],
    tips: [
      'Process must be created within a connection for access control',
      'For column-level lineage, table-level lineage must already exist',
      'Response includes 1 created (Process) + all updated input/output assets',
    ],
  },
];

// Method colors - dark theme
const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
  get: { bg: 'var(--method-get)', text: 'white' },
  post: { bg: 'var(--method-post)', text: 'var(--bg-primary)' },
  put: { bg: 'var(--method-put)', text: 'var(--bg-primary)' },
  patch: { bg: 'var(--method-patch)', text: 'var(--bg-primary)' },
  delete: { bg: 'var(--method-delete)', text: 'white' },
};

const METHOD_BG: Record<string, { bg: string; border: string }> = {
  get: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)' },
  post: { bg: 'rgba(45, 212, 191, 0.1)', border: 'rgba(45, 212, 191, 0.3)' },
  put: { bg: 'rgba(167, 139, 250, 0.1)', border: 'rgba(167, 139, 250, 0.3)' },
  patch: { bg: 'rgba(251, 191, 36, 0.1)', border: 'rgba(251, 191, 36, 0.3)' },
  delete: { bg: 'rgba(244, 63, 94, 0.1)', border: 'rgba(244, 63, 94, 0.3)' },
};

// Parse OpenAPI spec
function parseSpec() {
  const paths = (spec as Record<string, unknown>).paths as Record<string, PathItem>;
  const tags = ((spec as Record<string, unknown>).tags as TagInfo[]) || [];

  const operations: Array<{
    path: string;
    method: string;
    operation: Operation;
    tags: string[];
  }> = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const op = pathItem[method];
      if (op) {
        operations.push({
          path,
          method,
          operation: op,
          tags: op.tags || [],
        });
      }
    }
  }

  return { operations, tags };
}

// Components
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded transition-colors"
      style={{ background: copied ? 'var(--accent-emerald-dim)' : 'var(--surface-hover)' }}
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="w-4 h-4" style={{ color: 'var(--accent-emerald)' }} />
      ) : (
        <Copy className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
      )}
    </button>
  );
}

function CodeBlock({ code, language = 'json' }: { code: string; language?: string }) {
  return (
    <div
      className="relative group rounded-lg overflow-hidden"
      style={{
        background: 'var(--surface-dim)',
        border: '1px solid var(--border-subtle)'
      }}
    >
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <CopyButton text={code} />
      </div>
      <pre
        className="p-4 overflow-x-auto text-sm"
        style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}
      >
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  );
}

// Workflow Steps component for multi-step use cases
function WorkflowSteps({ workflow }: { workflow: WorkflowDefinition }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-6 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
            <Workflow className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-indigo-900">{workflow.title}</h3>
            <p className="text-sm text-indigo-600">{workflow.steps.length} step{workflow.steps.length > 1 ? 's' : ''} workflow</p>
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="w-5 h-5 text-indigo-500" />
        ) : (
          <ChevronRight className="w-5 h-5 text-indigo-500" />
        )}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-indigo-700">{workflow.description}</p>

          {/* Prerequisites */}
          {workflow.prerequisites && workflow.prerequisites.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">Prerequisites</h4>
              <ul className="text-sm text-amber-700 space-y-1">
                {workflow.prerequisites.map((prereq, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">•</span>
                    {prereq}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Steps */}
          <div className="relative">
            {/* Vertical line connecting steps */}
            <div className="absolute left-4 top-8 bottom-4 w-0.5 bg-indigo-200" />

            <div className="space-y-4">
              {workflow.steps.map((step) => (
                <div key={step.step} className="relative flex gap-4">
                  {/* Step number circle */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold z-10 ${step.optional
                    ? 'bg-slate-200 text-slate-600 border-2 border-dashed border-slate-400'
                    : 'bg-indigo-500 text-white'
                    }`}>
                    {step.step}
                  </div>

                  {/* Step content */}
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h5 className="font-medium text-slate-800">{step.title}</h5>
                      {step.optional && (
                        <span className="px-2 py-0.5 text-xs bg-slate-200 text-slate-600 rounded-full">Optional</span>
                      )}
                      {step.method && step.endpoint && (
                        <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono">
                          <span className={`font-semibold ${step.method === 'GET' ? 'text-blue-600' :
                            step.method === 'POST' ? 'text-teal-600' :
                              step.method === 'PUT' ? 'text-amber-600' :
                                'text-red-600'
                            }`}>{step.method}</span>
                          {' '}{step.endpoint}
                        </code>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mt-1">{step.description}</p>
                    {step.condition && (
                      <p className="text-xs text-slate-500 mt-1 italic">↳ {step.condition}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tips */}
          {workflow.tips && workflow.tips.length > 0 && (
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
              <h4 className="text-xs font-semibold text-teal-800 uppercase tracking-wide mb-2">💡 Tips</h4>
              <ul className="text-sm text-teal-700 space-y-1">
                {workflow.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-teal-500 mt-0.5">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function stripJsonLineComments(input: string) {
  // Note: simple line-based stripping intended for Atlan docs style snippets.
  // This will remove everything after // on a line, which is sufficient for typical examples.
  return input
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/g, '').trimEnd())
    .join('\n')
    .trim();
}

function exampleToRequestBody(example: { value?: unknown; 'x-atlanSnippet'?: string }) {
  if (example.value !== undefined) {
    return JSON.stringify(example.value, null, 2);
  }
  if (example['x-atlanSnippet']) {
    const stripped = stripJsonLineComments(example['x-atlanSnippet']);
    try {
      return JSON.stringify(JSON.parse(stripped), null, 2);
    } catch {
      // Fallback: show raw snippet if it isn't parseable after stripping comments
      return example['x-atlanSnippet'];
    }
  }
  return '{}';
}

function MethodBadge({ method }: { method: string }) {
  const style = METHOD_COLORS[method] || METHOD_COLORS.get;
  return (
    <span
      className="text-xs font-bold px-2 py-1 rounded uppercase tracking-wide"
      style={{
        background: style.bg,
        color: style.text,
        fontFamily: 'var(--font-mono)'
      }}
    >
      {method}
    </span>
  );
}

function ParameterTable({ parameters }: { parameters: Parameter[] }) {
  if (!parameters.length) return null;

  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold text-slate-700 mb-2">Parameters</h4>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Name</th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">In</th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Type</th>
              <th className="text-left px-4 py-2 font-medium text-slate-600">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {parameters.map((param, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-4 py-2">
                  <code className="text-sm font-mono text-pink-600">{param.name}</code>
                  {param.required && <span className="text-red-500 ml-1">*</span>}
                </td>
                <td className="px-4 py-2 text-slate-500">{param.in}</td>
                <td className="px-4 py-2 text-slate-500">{param.schema?.type || 'string'}</td>
                <td className="px-4 py-2 text-slate-600">{param.description || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OperationCard({
  path,
  method,
  operation,
  isExpanded,
  onToggle,
  onTryIt,
  filterByTag,
}: {
  path: string;
  method: string;
  operation: Operation;
  isExpanded: boolean;
  onToggle: () => void;
  onTryIt: () => void;
  filterByTag?: string | null;
}) {
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.substring(1);
      if (hash === operation.operationId) {
        setIsFocused(true);
        const timer = setTimeout(() => setIsFocused(false), 3000);
        return () => clearTimeout(timer);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [operation.operationId]);

  const allExamples = useMemo(() => {
    const content = operation.requestBody?.content?.['application/json'];
    const examples = content?.examples || {};
    return Object.entries(examples).map(([key, ex]) => ({
      key,
      summary: ex.summary || key,
      description: ex.description,
      value: ex.value,
      snippet: ex['x-atlanSnippet'],
      docUrl: ex['x-docUrl'],
      useCaseTag: ex['x-useCaseTag'],
    }));
  }, [operation]);

  // Filter examples by tag if one is selected
  const requestExamples = useMemo(() => {
    if (!filterByTag) return allExamples;
    const filtered = allExamples.filter((ex) => ex.useCaseTag === filterByTag);
    return filtered.length > 0 ? filtered : allExamples;
  }, [allExamples, filterByTag]);

  const [selectedExampleKey, setSelectedExampleKey] = useState<string>('');
  useEffect(() => {
    setSelectedExampleKey(requestExamples[0]?.key || '');
  }, [requestExamples]);

  const selectedExample = useMemo(() => {
    return requestExamples.find((e) => e.key === selectedExampleKey) || requestExamples[0];
  }, [requestExamples, selectedExampleKey]);

  const requestExampleCode = useMemo(() => {
    if (!selectedExample) return null;
    if (selectedExample.snippet) return selectedExample.snippet;
    if (selectedExample.value !== undefined) return JSON.stringify(selectedExample.value, null, 2);
    return null;
  }, [selectedExample]);

  const bgStyle = METHOD_BG[method] || METHOD_BG.get;

  return (
    <div
      id={operation.operationId}
      className={`group rounded-lg overflow-hidden transition-all duration-300 ${isFocused ? 'ring-2 ring-teal-500/50 shadow-[0_0_30px_rgba(45,212,191,0.2)]' : 'hover:shadow-md'}`}
      style={{
        background: isExpanded ? 'var(--surface-dim)' : bgStyle.bg,
        border: `1px solid ${isFocused ? 'var(--accent-teal)' : isExpanded ? 'var(--border-subtle)' : 'transparent'}`,
        scrollMarginTop: '100px'
      }}
    >
      <div
        ref={(el) => {
          if (el && isFocused) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }}
      />
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 transition-colors"
        style={{ background: 'transparent' }}
      >
        <MethodBadge method={method} />
        <code
          className="text-sm flex-1 text-left"
          style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}
        >
          {path}
        </code>
        <span
          className="text-sm hidden md:block max-w-md truncate"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {operation.summary}
        </span>
        {isExpanded ? (
          <ChevronDown className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
        ) : (
          <ChevronRight className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div
          className="px-4 py-4"
          style={{
            background: 'var(--surface-default)',
            borderTop: '1px solid var(--border-subtle)'
          }}
        >
          {/* Description */}
          {operation.description && (
            <p
              className="text-sm mb-4 whitespace-pre-line"
              style={{ color: 'var(--text-secondary)' }}
            >
              {operation.description}
            </p>
          )}

          {/* External docs link */}
          {operation.externalDocs && (
            <a
              href={operation.externalDocs.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm mb-4 transition-colors"
              style={{ color: 'var(--accent-teal)' }}
            >
              <BookOpen className="w-4 h-4" />
              View in Developer Docs
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          {/* Parameters */}
          {operation.parameters && <ParameterTable parameters={operation.parameters} />}

          {/* Request body examples */}
          {requestExamples.length > 0 && (
            <div className="mt-4">
              <h4
                className="text-sm font-semibold mb-3"
                style={{ color: 'var(--text-primary)' }}
              >
                Request Body
              </h4>

              {/* Example pills - only show if multiple examples */}
              {requestExamples.length > 1 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {requestExamples.map((ex) => (
                    <button
                      key={ex.key}
                      onClick={() => setSelectedExampleKey(ex.key)}
                      className="px-3 py-1.5 text-xs font-medium rounded-full transition-all"
                      style={selectedExampleKey === ex.key ? {
                        background: 'var(--accent-teal)',
                        color: 'var(--bg-primary)'
                      } : {
                        background: 'var(--surface-bright)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      {ex.summary}
                    </button>
                  ))}
                </div>
              )}

              {selectedExample?.docUrl && (
                <a
                  href={selectedExample.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm mb-2 transition-colors"
                  style={{ color: 'var(--accent-teal)' }}
                >
                  <BookOpen className="w-4 h-4" />
                  View example in docs
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}

              {requestExampleCode && <CodeBlock code={requestExampleCode} />}
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={onTryIt}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              style={{
                background: 'var(--accent-teal)',
                color: 'var(--bg-primary)'
              }}
            >
              <Play className="w-4 h-4" />
              Try it
            </button>
            {operation.externalDocs && (
              <a
                href={operation.externalDocs.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                style={{
                  background: 'var(--surface-bright)',
                  color: 'var(--text-secondary)'
                }}
              >
                <ExternalLink className="w-4 h-4" />
                Full docs
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TryItPanel({
  path,
  method,
  operation,
  baseUrl,
  apiToken,
  onClose,
}: {
  path: string;
  method: string;
  operation: Operation;
  baseUrl: string;
  apiToken: string;
  onClose: () => void;
}) {
  const [showCopied, setShowCopied] = useState(false);

  const requestExamples = useMemo(() => {
    const content = operation.requestBody?.content?.['application/json'];
    const examples = content?.examples || {};
    return Object.entries(examples).map(([key, ex]) => ({
      key,
      summary: ex.summary || key,
      description: ex.description,
      value: ex.value,
      snippet: ex['x-atlanSnippet'],
      docUrl: ex['x-docUrl'],
    }));
  }, [operation]);

  const [selectedExampleKey, setSelectedExampleKey] = useState<string>('');
  useEffect(() => {
    setSelectedExampleKey(requestExamples[0]?.key || '');
  }, [requestExamples]);

  const selectedExample = useMemo(() => {
    return requestExamples.find((e) => e.key === selectedExampleKey) || requestExamples[0];
  }, [requestExamples, selectedExampleKey]);

  const [requestBody, setRequestBody] = useState(() => {
    const content = operation.requestBody?.content?.['application/json'];
    if (content?.example) return JSON.stringify(content.example, null, 2);
    const first = Object.values(content?.examples || {})[0];
    if (first) return exampleToRequestBody(first);
    return '{}';
  });

  useEffect(() => {
    if (!selectedExample) return;
    setRequestBody(exampleToRequestBody({ value: selectedExample.value, 'x-atlanSnippet': selectedExample.snippet }));
  }, [selectedExample?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [response, setResponse] = useState<{ status: number; body: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [pathParams, setPathParams] = useState<Record<string, string>>({});

  const resolvedPath = useMemo(() => {
    let p = path;
    for (const [key, value] of Object.entries(pathParams)) {
      p = p.replace(`{${key}}`, value);
    }
    return p;
  }, [path, pathParams]);

  const pathParamNames = useMemo(() => {
    const matches = path.match(/\{([^}]+)\}/g) || [];
    return matches.map((m) => m.slice(1, -1));
  }, [path]);

  const handleExecute = async () => {
    if (!baseUrl) {
      alert('Please configure your tenant URL in Settings');
      return;
    }

    setLoading(true);
    setResponse(null);

    try {
      const url = `${baseUrl.replace(/\/$/, '')}${resolvedPath}`;
      const options: RequestInit = {
        method: method.toUpperCase(),
        headers: {
          'Content-Type': 'application/json',
          ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
        },
      };

      if (['post', 'put', 'patch'].includes(method) && requestBody) {
        options.body = requestBody;
      }

      const res = await fetch(url, options);
      const text = await res.text();
      let formatted = text;
      try {
        formatted = JSON.stringify(JSON.parse(text), null, 2);
      } catch { }

      setResponse({ status: res.status, body: formatted });
    } catch (e) {
      setResponse({ status: 0, body: `Error: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div
        className="absolute right-0 top-0 bottom-0 w-full max-w-2xl shadow-2xl flex flex-col"
        style={{ background: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-subtle)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ background: 'var(--surface-default)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3">
            <MethodBadge method={method} />
            <code className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>{path}</code>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Example selector - pills */}
          {requestExamples.length > 1 && (
            <div>
              <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Choose an Example</h4>
              <div className="flex flex-wrap gap-2">
                {requestExamples.map((ex) => (
                  <button
                    key={ex.key}
                    onClick={() => setSelectedExampleKey(ex.key)}
                    className="px-3 py-1.5 text-xs font-medium rounded-full transition-all"
                    style={{
                      background: selectedExampleKey === ex.key ? 'var(--accent-teal)' : 'var(--surface-bright)',
                      color: selectedExampleKey === ex.key ? 'var(--bg-primary)' : 'var(--text-secondary)',
                      boxShadow: selectedExampleKey === ex.key ? 'var(--shadow-sm)' : 'none'
                    }}
                  >
                    {ex.summary}
                  </button>
                ))}
              </div>
              {selectedExample?.docUrl && (
                <a
                  href={selectedExample.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700 mt-3"
                >
                  <BookOpen className="w-4 h-4" />
                  View example in docs
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          )}

          {/* Path parameters */}
          {pathParamNames.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Path Parameters</h4>
              <div className="space-y-2">
                {pathParamNames.map((name) => (
                  <div key={name}>
                    <label className="block text-xs text-slate-500 mb-1">{name}</label>
                    <input
                      type="text"
                      value={pathParams[name] || ''}
                      onChange={(e) => setPathParams({ ...pathParams, [name]: e.target.value })}
                      placeholder={`Enter ${name}`}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Request body */}
          {['post', 'put', 'patch'].includes(method) && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">Request Body</h4>
              <textarea
                value={requestBody}
                onChange={(e) => setRequestBody(e.target.value)}
                className="w-full h-64 px-3 py-2 font-mono text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                spellCheck={false}
              />
            </div>
          )}

          {/* Execute button */}
          <div className="flex gap-3">
            <button
              onClick={handleExecute}
              disabled={loading || !baseUrl}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-teal-500 hover:bg-teal-600 disabled:bg-slate-300 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Execute
                </>
              )}
            </button>
            <button
              onClick={() => {
                let cmd = `curl -X ${method.toUpperCase()} '${baseUrl.replace(/\/$/, '')}${resolvedPath}'`;
                cmd += ` \\\n  -H 'Content-Type: application/json'`;
                if (apiToken) cmd += ` \\\n  -H 'Authorization: Bearer ${apiToken}'`;
                if (['post', 'put', 'patch'].includes(method) && requestBody) {
                  cmd += ` \\\n  -d '${requestBody.replace(/'/g, "'\\''")}'`;
                }
                navigator.clipboard.writeText(cmd);
                setShowCopied(true);
                setTimeout(() => setShowCopied(false), 2000);
              }}
              className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors flex items-center gap-2"
              title="Copy cURL command"
            >
              {showCopied ? <Check className="w-4 h-4 text-green-600" /> : <Code2 className="w-4 h-4" />}
            </button>
          </div>

          {/* Response */}
          {response && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                Response
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold ${response.status >= 200 && response.status < 300
                    ? 'bg-green-100 text-green-700'
                    : response.status >= 400
                      ? 'bg-red-100 text-red-700'
                      : 'bg-slate-100 text-slate-700'
                    }`}
                >
                  {response.status || 'Error'}
                </span>
              </h4>
              <CodeBlock code={response.body} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Main component
export function ApiDocs() {
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['common-actions', 'crud']));
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [expandedOps, setExpandedOps] = useState<Set<string>>(new Set());
  const [tryItOp, setTryItOp] = useState<{ path: string; method: string; operation: Operation } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem('atlan_base_url') || '');
  const [apiToken, setApiToken] = useState(() => localStorage.getItem('atlan_api_token') || '');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('atlan_base_url', baseUrl);
  }, [baseUrl]);

  useEffect(() => {
    localStorage.setItem('atlan_api_token', apiToken);
  }, [apiToken]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const { operations, tags } = useMemo(() => parseSpec(), []);

  // Filter operations by search and selected tag
  const filteredOperations = useMemo(() => {
    let ops = operations;

    if (selectedTag) {
      ops = ops.filter((op) => op.tags.includes(selectedTag));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      ops = ops.filter(
        (op) =>
          op.path.toLowerCase().includes(q) ||
          op.operation.summary?.toLowerCase().includes(q) ||
          op.operation.description?.toLowerCase().includes(q) ||
          op.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return ops;
  }, [operations, selectedTag, search]);

  // Get tag info
  const getTagInfo = useCallback(
    (tagName: string): TagInfo | undefined => {
      return tags.find((t) => t.name === tagName);
    },
    [tags]
  );

  // Count operations per tag
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const op of operations) {
      for (const tag of op.tags) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return counts;
  }, [operations]);

  const toggleGroup = (groupId: string) => {
    const next = new Set(expandedGroups);
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    setExpandedGroups(next);
  };

  const toggleOp = (opId: string) => {
    const next = new Set(expandedOps);
    if (next.has(opId)) {
      next.delete(opId);
    } else {
      next.add(opId);
    }
    setExpandedOps(next);
  };

  // Auto-expand operations when a specific use-case tag is selected
  useEffect(() => {
    if (selectedTag && filteredOperations.length > 0) {
      const opsToExpand = filteredOperations.map((op) => `${op.method}-${op.path}`);
      setExpandedOps(new Set(opsToExpand));
    }
  }, [selectedTag, filteredOperations]);

  // Handle deep linking from Use Cases
  useEffect(() => {
    const handleDeepLink = () => {
      const hash = window.location.hash.substring(1);
      if (!hash) return;

      const op = operations.find(o => o.operation.operationId === hash);
      if (op) {
        // If the operation is not in the current selection, switch tag
        if (!selectedTag || !op.tags.includes(selectedTag)) {
          setSelectedTag(op.tags[0]);
        }

        // Expand this specific op and scroll
        // Use double RAF to ensure React has fully rendered the new filtered list
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const opKey = `${op.method}-${op.path}`;
            setExpandedOps(prev => {
              const next = new Set(prev);
              next.add(opKey);
              return next;
            });

            // Force focus effect even if already expanded
            const el = document.getElementById(hash);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          });
        });
      }
    };

    handleDeepLink();
    window.addEventListener('hashchange', handleDeepLink);
    return () => window.removeEventListener('hashchange', handleDeepLink);
  }, [operations]); // Removed selectedTag dependency to avoid loops, operations is stable

  // Update document title based on selection
  useEffect(() => {
    if (selectedTag) {
      document.title = `${selectedTag} - Atlan API`;
    } else {
      document.title = 'Atlan API Reference';
    }
  }, [selectedTag]);

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Settings panel - collapsible bar */}
      {showSettings && (
        <div
          className="shrink-0"
          style={{
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-subtle)'
          }}
        >
          <div className="px-6 py-3">
            <div className="flex items-center gap-4 max-w-2xl">
              <div className="flex-1">
                <label
                  className="block text-xs mb-1"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Tenant URL
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://your-tenant.atlan.com"
                  className="w-full px-3 py-1.5 rounded-lg text-sm focus:outline-none"
                  style={{
                    background: 'var(--surface-dim)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>
              <div className="flex-1">
                <label
                  className="block text-xs mb-1"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  API Token
                </label>
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="Bearer token"
                  className="w-full px-3 py-1.5 rounded-lg text-sm focus:outline-none"
                  style={{
                    background: 'var(--surface-dim)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="mt-5 p-1.5 rounded"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p
              className="text-xs mt-1"
              style={{ color: 'var(--text-muted)' }}
            >
              Used for "Try it" requests. Never stored or transmitted.
            </p>
          </div>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <aside
          className="w-72 shrink-0 hidden lg:flex flex-col"
          style={{
            background: 'var(--bg-secondary)',
            borderRight: '1px solid var(--border-subtle)'
          }}
        >
          {/* Search */}
          <div
            className="p-4"
            style={{ borderBottom: '1px solid var(--border-subtle)' }}
          >
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: 'var(--text-tertiary)' }}
              />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search APIs... (Cmd+K)"
                className="w-full pl-10 pr-10 py-2.5 rounded-lg text-sm focus:outline-none"
                style={{
                  background: 'var(--surface-dim)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)'
                }}
              />
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors"
                style={{
                  color: showSettings ? 'var(--accent-teal)' : 'var(--text-tertiary)',
                  background: showSettings ? 'var(--accent-teal-dim)' : 'transparent'
                }}
                title="API Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-2">
            {/* All APIs */}
            <button
              onClick={() => setSelectedTag(null)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-left transition-colors"
              style={{
                background: !selectedTag ? 'var(--accent-teal-dim)' : 'transparent',
                color: !selectedTag ? 'var(--accent-teal)' : 'var(--text-secondary)'
              }}
            >
              <FileJson className="w-4 h-4" />
              All APIs
              <span
                className="ml-auto text-xs"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {operations.length}
              </span>
            </button>

            <div
              className="h-px my-3 mx-2"
              style={{ background: 'var(--border-subtle)' }}
            />

            {/* Groups */}
            {USE_CASE_GROUPS.map((group) => {
              const Icon = group.icon;
              const isExpanded = expandedGroups.has(group.id);
              const groupTags = group.tags.filter((t) => tagCounts[t]);

              if (!groupTags.length) return null;

              return (
                <div key={group.id} className="mb-1">
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Icon className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                    {group.name}
                    <ChevronRight
                      className={`w-4 h-4 ml-auto transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      style={{ color: 'var(--text-tertiary)' }}
                    />
                  </button>

                  {isExpanded && (
                    <div
                      className="ml-4 pl-2 mt-1 space-y-0.5"
                      style={{ borderLeft: '1px solid var(--border-subtle)' }}
                    >
                      {groupTags.map((tagName) => (
                        <button
                          key={tagName}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTag(tagName);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm text-left transition-colors"
                          style={{
                            background: selectedTag === tagName ? 'var(--accent-teal-dim)' : 'transparent',
                            color: selectedTag === tagName ? 'var(--accent-teal)' : 'var(--text-secondary)'
                          }}
                        >
                          <span className="truncate">{tagName}</span>
                          <span
                            className="ml-auto text-xs"
                            style={{ color: 'var(--text-tertiary)' }}
                          >
                            {tagCounts[tagName] || 0}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Footer */}
          <div
            className="p-4"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <a
              href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(spec, null, 2))}`}
              download="atlan-openapi.json"
              className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              style={{
                background: 'var(--surface-bright)',
                color: 'var(--text-secondary)'
              }}
            >
              <FileJson className="w-4 h-4" />
              Download OpenAPI Spec
            </a>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-8 py-10">
            {/* Header */}
            <div className="mb-8">
              {selectedTag ? (
                <>
                  <div
                    className="flex items-center gap-2 text-sm mb-4"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    <button
                      onClick={() => setSelectedTag(null)}
                      className="transition-colors"
                    >
                      All APIs
                    </button>
                    <ChevronRight className="w-4 h-4" />
                    <span style={{ color: 'var(--text-secondary)' }}>{selectedTag}</span>
                  </div>
                  <h2
                    className="text-2xl font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {selectedTag}
                  </h2>
                  {getTagInfo(selectedTag)?.description && (
                    <p
                      className="mt-2"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {getTagInfo(selectedTag)?.description}
                    </p>
                  )}
                  {getTagInfo(selectedTag)?.externalDocs && (
                    <a
                      href={getTagInfo(selectedTag)?.externalDocs?.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm mt-2 transition-colors"
                      style={{ color: 'var(--accent-teal)' }}
                    >
                      <BookOpen className="w-4 h-4" />
                      View documentation
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </>
              ) : (
                <>
                  <h2
                    className="text-3xl font-bold mb-3"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Atlan REST API
                  </h2>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    Complete API reference organized by use case. Select a category from the sidebar or search for
                    specific operations.
                  </p>
                </>
              )}
            </div>

            {/* Workflow guide for selected tag */}
            {selectedTag && WORKFLOW_DEFINITIONS.find(w => w.tag === selectedTag) && (
              <WorkflowSteps workflow={WORKFLOW_DEFINITIONS.find(w => w.tag === selectedTag)!} />
            )}

            {/* Mobile search */}
            <div className="lg:hidden mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search APIs..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            {/* Operations */}
            <div className="space-y-3">
              {filteredOperations.length === 0 ? (
                <div
                  className="text-center py-12"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <Search
                    className="w-12 h-12 mx-auto mb-4"
                    style={{ color: 'var(--border-default)' }}
                  />
                  <p>No APIs found matching your criteria.</p>
                </div>
              ) : (
                filteredOperations.map((op) => {
                  const opId = `${op.method}-${op.path}`;
                  return (
                    <OperationCard
                      key={opId}
                      path={op.path}
                      method={op.method}
                      operation={op.operation}
                      isExpanded={expandedOps.has(opId)}
                      onToggle={() => toggleOp(opId)}
                      onTryIt={() => setTryItOp({ path: op.path, method: op.method, operation: op.operation })}
                      filterByTag={selectedTag}
                    />
                  );
                })
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Try it panel */}
      {tryItOp && (
        <TryItPanel
          path={tryItOp.path}
          method={tryItOp.method}
          operation={tryItOp.operation}
          baseUrl={baseUrl}
          apiToken={apiToken}
          onClose={() => setTryItOp(null)}
        />
      )}
    </div>
  );
}
