import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Copy,
  Check,
  BookOpen,
  Zap,
  Shield,
  GitBranch,
  Database,
  Settings,
  Users,
  Workflow,
  Package,
  FileSearch,
  RefreshCw,
  Network,
  AlertTriangle,
  Lightbulb,
  Info,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Code2,
} from 'lucide-react';

import useCasesData from '../generated/use-cases-bundled.json';
import spec from '../generated/atlan-openapi-bundled.json';
import { PropertiesSidebar } from './PropertiesSidebar';

// Types
interface StepNote {
  type: string;
  title?: string;
  content: string;
}

interface UseCaseStep {
  step: number;
  title: string;
  description: string;
  method?: string;
  endpoint?: string;
  queryString?: string;
  queryParams?: Record<string, string>;
  optional?: boolean;
  condition?: string;
  notes?: StepNote[];
  examples?: UseCaseExample[];
  example?: UseCaseExample;
}

interface UseCaseExample {
  key?: string;
  summary?: string;
  description?: string;
  request?: unknown;
  requestRaw?: string;
  response?: unknown;
  pathParams?: Record<string, string>;
  queryParams?: Record<string, string>;
  note?: string;
}

interface UseCaseTip {
  title: string;
  content: string;
}

interface UseCasePrerequisite {
  title: string;
  description: string;
  howTo?: string;
}

interface UseCase {
  id: string;
  title: string;
  description: string;
  category: string;
  icon?: string;
  externalDocs?: { url: string; description?: string };
  prerequisites?: UseCasePrerequisite[];
  steps?: UseCaseStep[];
  tips?: UseCaseTip[];
  relatedUseCases?: { id: string; title: string }[];
  relatedTypes?: string[];
  _sourcePath?: string;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  order: number;
  useCases: UseCase[];
}

// Icon mapping
const ICON_MAP: Record<string, React.ElementType> = {
  zap: Zap,
  database: Database,
  search: FileSearch,
  'git-branch': GitBranch,
  'book-open': BookOpen,
  shield: Shield,
  network: Network,
  users: Users,
  workflow: Workflow,
  'refresh-cw': RefreshCw,
  package: Package,
  settings: Settings,
};

// Method colors with CSS variable names
const METHOD_STYLES: Record<string, { bg: string; text: string }> = {
  GET: { bg: 'var(--method-get)', text: 'white' },
  POST: { bg: 'var(--method-post)', text: 'var(--bg-primary)' },
  PUT: { bg: 'var(--method-put)', text: 'var(--bg-primary)' },
  PATCH: { bg: 'var(--method-patch)', text: 'var(--bg-primary)' },
  DELETE: { bg: 'var(--method-delete)', text: 'white' },
};

// Note type styling
const NOTE_STYLES: Record<string, {
  icon: React.ElementType;
  bg: string;
  border: string;
  titleColor: string;
  textColor: string;
  iconColor: string;
}> = {
  warning: {
    icon: AlertTriangle,
    bg: 'var(--accent-amber-dim)',
    border: 'var(--accent-amber)',
    titleColor: 'var(--accent-amber)',
    textColor: 'var(--text-secondary)',
    iconColor: 'var(--accent-amber)'
  },
  note: {
    icon: Info,
    bg: 'var(--accent-blue-dim)',
    border: 'var(--accent-blue)',
    titleColor: 'var(--accent-blue)',
    textColor: 'var(--text-secondary)',
    iconColor: 'var(--accent-blue)'
  },
  tip: {
    icon: Lightbulb,
    bg: 'var(--accent-emerald-dim)',
    border: 'var(--accent-emerald)',
    titleColor: 'var(--accent-emerald)',
    textColor: 'var(--text-secondary)',
    iconColor: 'var(--accent-emerald)'
  },
  recommendation: {
    icon: CheckCircle2,
    bg: 'var(--accent-teal-dim)',
    border: 'var(--accent-teal)',
    titleColor: 'var(--accent-teal)',
    textColor: 'var(--text-secondary)',
    iconColor: 'var(--accent-teal)'
  },
  info: {
    icon: Info,
    bg: 'var(--accent-blue-dim)',
    border: 'var(--accent-blue)',
    titleColor: 'var(--accent-blue)',
    textColor: 'var(--text-secondary)',
    iconColor: 'var(--accent-blue)'
  },
  question: {
    icon: HelpCircle,
    bg: 'var(--accent-purple-dim)',
    border: 'var(--accent-purple)',
    titleColor: 'var(--accent-purple)',
    textColor: 'var(--text-secondary)',
    iconColor: 'var(--accent-purple)'
  },
  danger: {
    icon: AlertCircle,
    bg: 'var(--accent-rose-dim)',
    border: 'var(--accent-rose)',
    titleColor: 'var(--accent-rose)',
    textColor: 'var(--text-secondary)',
    iconColor: 'var(--accent-rose)'
  },
};

// Deduplicate notes by title+content
function deduplicateNotes(notes: StepNote[]): StepNote[] {
  const seen = new Set<string>();
  return notes.filter(note => {
    const key = `${note.type}:${note.title}:${note.content}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function CopyButton({ text, size = 'sm' }: { text: string; size?: 'sm' | 'md' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-md transition-all duration-200"
      style={{
        background: copied ? 'var(--accent-emerald-dim)' : 'var(--surface-hover)',
      }}
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className={iconSize} style={{ color: 'var(--accent-emerald)' }} />
      ) : (
        <Copy className={iconSize} style={{ color: 'var(--text-tertiary)' }} />
      )}
    </button>
  );
}

function CodeBlock({ code, title }: { code: string; title?: string }) {
  const formatted = typeof code === 'string' ? code : JSON.stringify(code, null, 2);

  return (
    <div
      className="relative group rounded-lg overflow-hidden"
      style={{
        background: 'var(--surface-dim)',
        border: '1px solid var(--border-subtle)'
      }}
    >
      {title && (
        <div
          className="px-4 py-2 text-xs font-medium flex items-center justify-between"
          style={{
            background: 'var(--surface-default)',
            borderBottom: '1px solid var(--border-subtle)',
            color: 'var(--text-tertiary)'
          }}
        >
          <span>{title}</span>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <CopyButton text={formatted} />
          </div>
        </div>
      )}
      {!title && (
        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <CopyButton text={formatted} />
        </div>
      )}
      <pre
        className="p-4 overflow-x-auto text-sm leading-relaxed"
        style={{
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-primary)'
        }}
      >
        <code>{formatted}</code>
      </pre>
    </div>
  );
}

function EndpointDisplay({ method, endpoint, queryString, operationId }: {
  method?: string;
  endpoint?: string;
  queryString?: string;
  operationId?: string;
}) {
  const navigate = useNavigate();
  if (!method || !endpoint) return null;

  const fullUrl = queryString ? `${endpoint}?${queryString}` : endpoint;
  const style = METHOD_STYLES[method] || METHOD_STYLES.GET;

  const handleClick = (e: React.MouseEvent) => {
    if (operationId) {
      e.preventDefault();
      navigate(`/endpoints#${operationId}`);
    }
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-200 ${operationId ? 'hover:border-teal-500/50 cursor-pointer group/endpoint hover:shadow-md' : ''}`}
      style={{
        background: 'var(--surface-dim)',
        border: '1px solid var(--border-subtle)'
      }}
      onClick={handleClick}
    >
      <span
        className="px-2.5 py-1 text-xs font-semibold rounded uppercase tracking-wide shrink-0"
        style={{
          fontFamily: 'var(--font-mono)',
          background: style.bg,
          color: style.text
        }}
      >
        {method}
      </span>
      <code
        className={`flex-1 text-sm truncate ${operationId ? 'group-hover/endpoint:text-teal-500' : ''}`}
        style={{
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-secondary)'
        }}
        title={fullUrl}
      >
        {fullUrl}
      </code>
      <div className="flex items-center gap-2">
        {operationId && (
          <span className="text-[10px] uppercase tracking-tighter text-teal-500 font-bold opacity-0 group-hover/endpoint:opacity-100 transition-opacity">
            View API Docs
          </span>
        )}
        <CopyButton text={fullUrl} size="md" />
      </div>
    </div>
  );
}

function NotesSection({ notes }: { notes: StepNote[] }) {
  const [expanded, setExpanded] = useState(false);

  // Deduplicate notes
  const uniqueNotes = useMemo(() => deduplicateNotes(notes), [notes]);

  if (uniqueNotes.length === 0) return null;



  // Show first 2 notes collapsed, rest in "show more"
  const visibleCount = 2;
  const hasMore = uniqueNotes.length > visibleCount;
  const visibleNotes = expanded ? uniqueNotes : uniqueNotes.slice(0, visibleCount);

  return (
    <div className="space-y-2">
      {visibleNotes.map((note, idx) => {
        const style = NOTE_STYLES[note.type] || NOTE_STYLES.note;
        const NoteIcon = style.icon;

        return (
          <div
            key={idx}
            className="rounded-lg p-3"
            style={{
              background: style.bg,
              borderLeft: `3px solid ${style.border}`
            }}
          >
            <div className="flex items-start gap-2.5">
              <NoteIcon
                className="w-4 h-4 mt-0.5 shrink-0"
                style={{ color: style.iconColor }}
              />
              <div className="flex-1 min-w-0">
                {note.title && (
                  <div
                    className="text-sm font-medium mb-1"
                    style={{ color: style.titleColor }}
                  >
                    {note.title}
                  </div>
                )}
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: style.textColor }}
                >
                  {note.content}
                </p>
              </div>
            </div>
          </div>
        );
      })}

      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded transition-colors"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {expanded ? (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Show less
            </>
          ) : (
            <>
              <ChevronRight className="w-3.5 h-3.5" />
              Show {uniqueNotes.length - visibleCount} more notes
            </>
          )}
        </button>
      )}
    </div>
  );
}

/**
 * Helper to match use-case endpoints to OpenAPI operation IDs
 */
function useOperationMapping() {
  return useMemo(() => {
    const mapping: Record<string, string> = {};
    if (!spec || !spec.paths) return mapping;

    Object.entries(spec.paths).forEach(([path, pathItem]) => {
      Object.entries(pathItem).forEach(([method, op]: [string, any]) => {
        if (op && op.operationId) {
          const key = `${method.toUpperCase()}:${path}`;
          mapping[key] = op.operationId;
        }
      });
    });
    return mapping;
  }, []);
}

function findOperationId(mapping: Record<string, string>, method?: string, endpoint?: string) {
  if (!method || !endpoint) return undefined;

  const cleanEndpoint = endpoint.split('?')[0];
  const key = `${method.toUpperCase()}:${cleanEndpoint}`;

  // 1. Try exact match
  if (mapping[key]) return mapping[key];

  // 2. Try matching with path parameters
  const entries = Object.entries(mapping);
  for (const [mapKey, opId] of entries) {
    const [mapMethod, mapPath] = mapKey.split(':');
    if (mapMethod !== method.toUpperCase()) continue;

    // Convert OpenAPI path /foo/{id}/bar to regex ^/foo/[^/]+/bar$
    // Escape dots and other symbols, but keep /
    const escapedPath = mapPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\//g, '/');
    const regexSource = escapedPath.replace(/\\\{[^}]+\\\}/g, '[^/]+');
    const regex = new RegExp(`^${regexSource}$`);

    if (regex.test(cleanEndpoint)) {
      return opId;
    }
  }

  return undefined;
}

function StepCard({ step, isLast }: { step: UseCaseStep; isLast: boolean }) {
  const mapping = useOperationMapping();
  const operationId = findOperationId(mapping, step.method, step.endpoint);

  const [expanded, setExpanded] = useState(false);
  const examples = step.examples || (step.example ? [step.example] : []);
  const [selectedExampleIdx, setSelectedExampleIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<'request' | 'body' | 'response'>('body');
  const selectedExample = examples[selectedExampleIdx];

  // Build full URL for display
  const fullUrl = step.endpoint && step.queryString
    ? `${step.endpoint}?${step.queryString}`
    : step.endpoint;



  // Clean description - remove version numbers like "7.0.0 4.0.0"
  const cleanDescription = step.description?.replace(/^\d+\.\d+\.\d+\s*/g, '').trim();

  // Determine available tabs
  const hasBody = selectedExample?.request != null || !!selectedExample?.requestRaw;
  const hasResponse = selectedExample?.response != null;
  const showTabs = hasBody || hasResponse;

  // Auto-select first available tab if current is invalid
  useEffect(() => {
    if (showTabs && activeTab === 'body' && !hasBody && hasResponse) {
      setActiveTab('response');
    }
  }, [selectedExample, activeTab, hasBody, hasResponse, showTabs]);

  return (
    <div className="relative flex gap-6 group">
      {/* Vertical connector line */}
      {!isLast && (
        <div
          className="absolute left-6 top-14 bottom-0 w-px"
          style={{
            background: 'linear-gradient(to bottom, var(--border-strong) 0%, var(--border-subtle) 100%)'
          }}
        />
      )}

      {/* Step number */}
      <div
        className={`relative z-10 w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold shrink-0 transition-transform duration-300 group-hover:scale-110 ${step.optional ? '' : ''}`}
        style={step.optional ? {
          background: 'var(--surface-bright)',
          border: '2px dashed var(--border-strong)',
          color: 'var(--text-tertiary)'
        } : {
          background: 'var(--gradient-teal)',
          color: 'var(--bg-primary)',
          boxShadow: 'var(--shadow-glow-teal)'
        }}
      >
        {step.step}
      </div>

      {/* Step content */}
      <div className="flex-1 pb-12">
        {/* Header */}
        <div className="flex items-start gap-4 flex-wrap mb-4 pt-1">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h4
                className="font-bold text-xl tracking-tight"
                style={{ color: 'var(--text-primary)' }}
              >
                {step.title}
              </h4>
              {step.optional && (
                <span
                  className="px-2.5 py-1 text-xs font-medium rounded-full uppercase tracking-wider"
                  style={{
                    background: 'var(--surface-bright)',
                    color: 'var(--text-tertiary)',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  Optional
                </span>
              )}
            </div>
            {step.condition && (
              <div
                className="flex items-start gap-2 mt-2 p-3 rounded-lg text-sm"
                style={{
                  background: 'var(--surface-bright)',
                  borderLeft: '3px solid var(--accent-purple)'
                }}
              >
                <GitBranch className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--accent-purple)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>
                  <span className="font-semibold" style={{ color: 'var(--accent-purple)' }}>Condition:</span> {step.condition}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Endpoint display */}
        {step.method && step.endpoint && (
          <div className="mb-6 transform transition-all duration-300 hover:translate-x-1">
            <EndpointDisplay
              method={step.method}
              endpoint={step.endpoint}
              queryString={step.queryString}
              operationId={operationId}
            />
          </div>
        )}

        {/* Description */}
        {cleanDescription && (
          <div className="prose prose-sm max-w-none mb-6">
            <p
              className="text-base leading-relaxed whitespace-pre-line"
              style={{ color: 'var(--text-secondary)' }}
            >
              {cleanDescription}
            </p>
          </div>
        )}

        {/* Query Parameters display */}
        {step.queryString && (
          <div className="mb-6">
            <div
              className="text-xs font-semibold uppercase tracking-wider mb-2.5"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Query Parameters
            </div>
            <div className="flex flex-wrap gap-2">
              {step.queryString.split('&').map((param, idx) => {
                const [key, value] = param.split('=');
                return (
                  <span
                    key={idx}
                    className="flex items-center text-xs rounded-md overflow-hidden border transition-colors hover:border-blue-400"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      background: 'var(--surface-bright)',
                      borderColor: 'var(--border-subtle)'
                    }}
                  >
                    <span
                      className="px-2 py-1.5 font-medium border-r"
                      style={{
                        background: 'rgba(59, 130, 246, 0.1)',
                        color: 'var(--accent-blue)',
                        borderColor: 'var(--border-subtle)'
                      }}
                    >
                      {key}
                    </span>
                    <span className="px-2 py-1.5" style={{ color: 'var(--text-primary)' }}>
                      {value}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Notes/Admonitions */}
        {step.notes && step.notes.length > 0 && (
          <div className="mb-6">
            <NotesSection notes={step.notes} />
          </div>
        )}

        {/* Examples */}
        {examples.length > 0 && (
          <div
            className="rounded-xl overflow-hidden border transition-all duration-300"
            style={{
              background: 'var(--surface-dim)',
              borderColor: expanded ? 'var(--accent-teal)' : 'var(--border-subtle)',
              boxShadow: expanded ? '0 4px 20px -5px rgba(0,0,0,0.1)' : 'none'
            }}
          >
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition-colors"
            >
              <span
                className="text-sm font-semibold flex items-center gap-2"
                style={{ color: 'var(--text-primary)' }}
              >
                <span className="p-1 rounded bg-teal-500/10 text-teal-500">
                  <Code2 className="w-4 h-4" />
                </span>
                Example Payload & Response
              </span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                  {examples.length} {examples.length === 1 ? 'Example' : 'Examples'}
                </span>
                {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              </div>
            </button>

            {expanded && (
              <div className="border-t border-slate-200 dark:border-slate-800">
                {/* Example selector */}
                {examples.length > 1 && (
                  <div className="flex gap-2 p-3 overflow-x-auto border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                    {examples.map((ex, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedExampleIdx(idx)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap ${selectedExampleIdx === idx
                          ? 'bg-white shadow text-teal-600 ring-1 ring-teal-500/20'
                          : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-700'
                          }`}
                      >
                        {ex.summary?.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/, '') || `Example ${idx + 1}`}
                      </button>
                    ))}
                  </div>
                )}

                {selectedExample && (
                  <div className="p-4 space-y-4 bg-slate-50/50">
                    {selectedExample.description && (
                      <p className="text-sm text-slate-600 mb-4 px-1">
                        {selectedExample.description}
                      </p>
                    )}

                    {/* Tabs */}
                    {showTabs ? (
                      <div>
                        <div className="flex gap-6 border-b border-slate-200 mb-4">
                          {hasBody && (
                            <button
                              onClick={() => setActiveTab('body')}
                              className={`pb-2 text-sm font-medium transition-colors relative ${activeTab === 'body'
                                ? 'text-teal-600'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                              Request Body
                              {activeTab === 'body' && (
                                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500 rounded-t-full" />
                              )}
                            </button>
                          )}
                          {hasResponse && (
                            <button
                              onClick={() => setActiveTab('response')}
                              className={`pb-2 text-sm font-medium transition-colors relative ${activeTab === 'response'
                                ? 'text-teal-600'
                                : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                              Response
                              {activeTab === 'response' && (
                                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500 rounded-t-full" />
                              )}
                            </button>
                          )}
                        </div>

                        {/* Tab Content */}
                        <div className="min-h-[200px]">
                          {activeTab === 'body' && (
                            <>
                              {selectedExample.request ? (
                                <CodeBlock code={JSON.stringify(selectedExample.request, null, 2)} />
                              ) : selectedExample.requestRaw ? (
                                <CodeBlock code={selectedExample.requestRaw} />
                              ) : (
                                <div className="text-sm text-slate-400 italic p-4 text-center">No request body</div>
                              )}
                            </>
                          )}
                          {activeTab === 'response' && (
                            <>
                              {selectedExample.response ? (
                                <CodeBlock code={JSON.stringify(selectedExample.response, null, 2)} />
                              ) : (
                                <div className="text-sm text-slate-400 italic p-4 text-center">No response body</div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      /* Fallback if no body/response (e.g. GET with simple params) */
                      <div>
                        <div className="text-xs font-semibold uppercase text-slate-400 mb-2">Request</div>
                        <CodeBlock code={`${step.method} ${fullUrl}`} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function UseCaseDetail({ useCase, onSelectRelated }: { useCase: UseCase; onSelectRelated: (id: string) => void }) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2
          className="text-2xl font-bold mb-3"
          style={{ color: 'var(--text-primary)' }}
        >
          {useCase.title}
        </h2>
        <p
          className="leading-relaxed whitespace-pre-line"
          style={{ color: 'var(--text-secondary)' }}
        >
          {useCase.description}
        </p>

        {useCase.externalDocs && (
          <a
            href={useCase.externalDocs.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm mt-4 transition-colors"
            style={{ color: 'var(--accent-teal)' }}
          >
            <BookOpen className="w-4 h-4" />
            View full documentation
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Prerequisites */}
      {useCase.prerequisites && useCase.prerequisites.length > 0 && (
        <div
          className="rounded-xl p-5"
          style={{
            background: 'var(--accent-amber-dim)',
            border: '1px solid rgba(251, 191, 36, 0.3)'
          }}
        >
          <h3
            className="flex items-center gap-2 font-semibold mb-4"
            style={{ color: 'var(--accent-amber)' }}
          >
            <AlertTriangle className="w-5 h-5" />
            Prerequisites
          </h3>
          <div className="space-y-4">
            {useCase.prerequisites.map((prereq, i) => (
              <div key={i}>
                <h4
                  className="font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {prereq.title}
                </h4>
                <p
                  className="text-sm mt-1"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {prereq.description}
                </p>
                {prereq.howTo && (
                  <p
                    className="text-sm mt-1 italic"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    → {prereq.howTo}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Steps */}
      {useCase.steps && useCase.steps.length > 0 && (
        <div>
          <h3
            className="flex items-center gap-2 font-semibold mb-6"
            style={{ color: 'var(--text-primary)' }}
          >
            <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--accent-teal)' }} />
            Steps
          </h3>
          <div className="space-y-0">
            {useCase.steps.map((step, idx) => (
              <StepCard
                key={step.step}
                step={step}
                isLast={idx === useCase.steps!.length - 1}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      {useCase.tips && useCase.tips.length > 0 && (
        <div
          className="rounded-xl p-5"
          style={{
            background: 'var(--accent-teal-dim)',
            border: '1px solid rgba(45, 212, 191, 0.3)'
          }}
        >
          <h3
            className="flex items-center gap-2 font-semibold mb-4"
            style={{ color: 'var(--accent-teal)' }}
          >
            <Lightbulb className="w-5 h-5" />
            Tips
          </h3>
          <div className="space-y-4">
            {useCase.tips.map((tip, i) => (
              <div key={i}>
                <h4
                  className="font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {tip.title}
                </h4>
                <p
                  className="text-sm mt-1 whitespace-pre-line"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {tip.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Related use cases */}
      {useCase.relatedUseCases && useCase.relatedUseCases.length > 0 && (
        <div>
          <h3
            className="font-semibold mb-4"
            style={{ color: 'var(--text-primary)' }}
          >
            Related Use Cases
          </h3>
          <div className="flex flex-wrap gap-2">
            {useCase.relatedUseCases.map((related) => (
              <button
                key={related.id}
                onClick={() => onSelectRelated(related.id)}
                className="px-3 py-2 text-sm rounded-lg transition-colors"
                style={{
                  background: 'var(--surface-bright)',
                  color: 'var(--text-secondary)'
                }}
              >
                {related.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function UseCaseDocs() {
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['common-actions', 'workflows'])
  );
  const [selectedUseCaseId, setSelectedUseCaseId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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


  const categories = useMemo(() => {
    return (useCasesData as { categories: Category[] }).categories;
  }, []);

  // Build lookup map for use cases
  const useCaseLookup = useMemo(() => {
    const lookup: Record<string, UseCase> = {};
    for (const cat of categories) {
      for (const uc of cat.useCases) {
        lookup[uc.id] = uc;
      }
    }
    return lookup;
  }, [categories]);

  // Filter by search
  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories;

    const q = search.toLowerCase();
    return categories
      .map(cat => ({
        ...cat,
        useCases: cat.useCases.filter(
          uc =>
            uc.title.toLowerCase().includes(q) ||
            uc.description?.toLowerCase().includes(q) ||
            uc.id.toLowerCase().includes(q)
        ),
      }))
      .filter(cat => cat.useCases.length > 0);
  }, [categories, search]);

  const selectedUseCase = selectedUseCaseId ? useCaseLookup[selectedUseCaseId] : null;

  useEffect(() => {
    if (selectedUseCase) {
      document.title = `${selectedUseCase.title} - Atlan API`;
    } else {
      document.title = 'Use Cases - Atlan API';
    }
  }, [selectedUseCase]);

  const toggleCategory = (catId: string) => {
    const next = new Set(expandedCategories);
    if (next.has(catId)) {
      next.delete(catId);
    } else {
      next.add(catId);
    }
    setExpandedCategories(next);
  };

  const handleSelectRelated = (id: string) => {
    setSelectedUseCaseId(id);
    // Expand the category containing this use case
    for (const cat of categories) {
      if (cat.useCases.some(uc => uc.id === id)) {
        setExpandedCategories(prev => new Set([...prev, cat.id]));
        break;
      }
    }
  };

  return (
    <div className="h-full flex" style={{ background: 'var(--bg-primary)' }}>
      {/* Sidebar */}
      <aside
        className="w-72 border-r shrink-0 hidden lg:flex flex-col"
        style={{
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border-subtle)'
        }}
      >
        {/* Search */}
        <div
          className="p-4 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
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
              placeholder="Search use cases... (Cmd+K)"
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg transition-all focus:outline-none"
              style={{
                background: 'var(--surface-dim)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)'
              }}
            />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2">
          {/* All Use Cases */}
          <button
            onClick={() => setSelectedUseCaseId(null)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-left transition-colors"
            style={{
              background: !selectedUseCaseId ? 'var(--gradient-teal)' : 'transparent',
              color: !selectedUseCaseId ? 'var(--bg-primary)' : 'var(--text-secondary)',
              fontWeight: !selectedUseCaseId ? 600 : 400,
              boxShadow: !selectedUseCaseId ? 'var(--shadow-glow-teal)' : 'none'
            }}
          >
            <BookOpen className="w-4 h-4" />
            All Use Cases
          </button>

          <div
            className="h-px my-3 mx-2"
            style={{ background: 'var(--border-subtle)' }}
          />

          {/* Categories */}
          {filteredCategories.map((category) => {
            const Icon = ICON_MAP[category.icon] || BookOpen;
            const isExpanded = expandedCategories.has(category.id);

            return (
              <div key={category.id} className="mb-1">
                <button
                  onClick={() => toggleCategory(category.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Icon className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
                  <span className="flex-1 text-left">{category.name}</span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: 'var(--surface-bright)',
                      color: 'var(--text-tertiary)'
                    }}
                  >
                    {category.useCases.length}
                  </span>
                  <ChevronRight
                    className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                    style={{ color: 'var(--text-tertiary)' }}
                  />
                </button>

                {isExpanded && (
                  <div
                    className="ml-4 border-l pl-2 mt-1 space-y-0.5"
                    style={{ borderColor: 'var(--border-subtle)' }}
                  >
                    {category.useCases.map((useCase) => (
                      <button
                        key={useCase.id}
                        onClick={() => setSelectedUseCaseId(useCase.id)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm text-left transition-colors"
                        style={{
                          background: selectedUseCaseId === useCase.id ? 'var(--surface-bright)' : 'transparent',
                          color: selectedUseCaseId === useCase.id ? 'var(--accent-teal)' : 'var(--text-secondary)',
                          borderLeft: selectedUseCaseId === useCase.id ? '2px solid var(--accent-teal)' : '2px solid transparent',
                          fontWeight: selectedUseCaseId === useCase.id ? 500 : 400
                        }}
                      >
                        <span className="truncate">{useCase.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Main content + Properties sidebar wrapper */}
      <div className="flex-1 flex min-w-0">
        {/* Main content */}
        <main className="flex-1 overflow-y-auto min-w-0">
          <div className={`mx-auto px-8 py-10 ${selectedUseCase?.relatedTypes?.length ? 'max-w-3xl' : 'max-w-4xl'}`}>
            {selectedUseCase ? (
              <>
                {/* Breadcrumb */}
                <div
                  className="flex items-center gap-2 text-sm mb-8"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <button
                    onClick={() => setSelectedUseCaseId(null)}
                    className="transition-colors"
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    All Use Cases
                  </button>
                  <ChevronRight className="w-4 h-4" />
                  <span style={{ color: 'var(--text-secondary)' }}>{selectedUseCase.title}</span>
                </div>

                <UseCaseDetail
                  useCase={selectedUseCase}
                  onSelectRelated={handleSelectRelated}
                />
              </>
            ) : (
              <>
                <h2
                  className="text-3xl font-bold mb-3"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Atlan API Use Cases
                </h2>
                <p
                  className="text-lg mb-10"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Step-by-step guides for common Atlan API tasks. Each use case includes prerequisites,
                  API calls, and working examples.
                </p>

                {/* Category cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {categories.map((category) => {
                    const Icon = ICON_MAP[category.icon] || BookOpen;
                    return (
                      <button
                        key={category.id}
                        onClick={() => {
                          setExpandedCategories(prev => new Set([...prev, category.id]));
                          if (category.useCases.length > 0) {
                            setSelectedUseCaseId(category.useCases[0].id);
                          }
                        }}
                        className="flex items-start gap-4 p-5 rounded-xl text-left transition-all duration-200 group"
                        style={{
                          background: 'var(--surface-default)',
                          border: '1px solid var(--border-subtle)'
                        }}
                      >
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: 'var(--accent-teal-dim)' }}
                        >
                          <Icon className="w-5 h-5" style={{ color: 'var(--accent-teal)' }} />
                        </div>
                        <div>
                          <h3
                            className="font-semibold group-hover:text-teal-400 transition-colors"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {category.name}
                          </h3>
                          <p
                            className="text-sm mt-1"
                            style={{ color: 'var(--text-tertiary)' }}
                          >
                            {category.useCases.length} use case{category.useCases.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </main>

        {/* Properties sidebar - only shown when use case with relatedTypes is selected */}
        {selectedUseCase?.relatedTypes && selectedUseCase.relatedTypes.length > 0 && (
          <PropertiesSidebar relatedTypes={selectedUseCase.relatedTypes} />
        )}
      </div>
    </div>
  );
}
