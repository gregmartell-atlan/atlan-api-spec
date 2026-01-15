import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Search,
  ChevronRight,
  ExternalLink,
  Copy,
  Check,
  BookOpen,
  Database,
  Box,
  List,
  Lock,
  Loader2,
} from 'lucide-react';

import modelsIndex from '../generated/models-index.json';

// Types
interface Property {
  name: string;
  type: string;
  readOnly: boolean;
  description?: string;
}

interface EntityIndex {
  id: string;
  title: string;
  propertyCount: number;
  searchableProps: string[];
}

interface EntityDetail {
  id: string;
  title: string;
  url: string;
  description?: string;
  inheritance?: string[];
  properties?: Property[];
}

interface ModelsIndex {
  generatedAt: string;
  totalEntities: number;
  totalProperties: number;
  entities: EntityIndex[];
}

// Type badge colors - dark theme
const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  string: { bg: 'rgba(52, 211, 153, 0.15)', text: 'var(--accent-emerald)' },
  boolean: { bg: 'rgba(167, 139, 250, 0.15)', text: 'var(--accent-purple)' },
  long: { bg: 'rgba(59, 130, 246, 0.15)', text: 'var(--accent-blue)' },
  int: { bg: 'rgba(59, 130, 246, 0.15)', text: 'var(--accent-blue)' },
  double: { bg: 'rgba(59, 130, 246, 0.15)', text: 'var(--accent-blue)' },
  float: { bg: 'rgba(59, 130, 246, 0.15)', text: 'var(--accent-blue)' },
  timestamp: { bg: 'rgba(251, 191, 36, 0.15)', text: 'var(--accent-amber)' },
  date: { bg: 'rgba(251, 191, 36, 0.15)', text: 'var(--accent-amber)' },
  enum: { bg: 'rgba(244, 63, 94, 0.15)', text: 'var(--accent-rose)' },
  'array<string>': { bg: 'rgba(45, 212, 191, 0.15)', text: 'var(--accent-teal)' },
  'array<object>': { bg: 'rgba(45, 212, 191, 0.15)', text: 'var(--accent-teal)' },
  map: { bg: 'rgba(251, 191, 36, 0.15)', text: 'var(--accent-amber)' },
  object: { bg: 'var(--surface-bright)', text: 'var(--text-secondary)' },
  unknown: { bg: 'var(--surface-bright)', text: 'var(--text-tertiary)' },
};

// Cache for loaded entity details
const entityCache = new Map<string, EntityDetail>();

async function loadEntityDetail(entityId: string): Promise<EntityDetail | null> {
  // Check cache first
  if (entityCache.has(entityId)) {
    return entityCache.get(entityId)!;
  }

  try {
    const response = await fetch(`/models/${entityId}.json`);
    if (!response.ok) throw new Error('Not found');
    const data = await response.json();
    entityCache.set(entityId, data);
    return data;
  } catch (error) {
    console.error(`Failed to load entity ${entityId}:`, error);
    return null;
  }
}

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
      className="p-1 rounded transition-colors"
      style={{ background: copied ? 'var(--accent-emerald-dim)' : 'transparent' }}
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="w-3 h-3" style={{ color: 'var(--accent-emerald)' }} />
      ) : (
        <Copy className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
      )}
    </button>
  );
}

function PropertyRow({ property }: { property: Property }) {
  const typeStyle = TYPE_COLORS[property.type] || TYPE_COLORS.unknown;

  return (
    <tr
      className="transition-colors"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      <td className="py-3 px-4" style={{ fontFamily: 'var(--font-mono)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{property.name}</span>
          <CopyButton text={property.name} />
          {property.readOnly && (
            <span title="Read-only">
              <Lock className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
            </span>
          )}
        </div>
      </td>
      <td className="py-3 px-4">
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: typeStyle.bg, color: typeStyle.text }}
        >
          {property.type}
        </span>
      </td>
      <td
        className="py-3 px-4 text-sm max-w-md truncate"
        style={{ color: 'var(--text-secondary)' }}
        title={property.description}
      >
        {property.description || '-'}
      </td>
    </tr>
  );
}

// Virtualized list - only render visible items
const ITEMS_PER_PAGE = 30;

function EntityDetailView({ entity }: { entity: EntityDetail }) {
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const properties = entity.properties || [];
  const displayProperties = properties.slice(0, visibleCount);
  const hasMore = visibleCount < properties.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2
          className="text-2xl font-bold"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
        >
          {entity.title}
        </h2>
        {entity.description && (
          <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>{entity.description}</p>
        )}

        <div className="flex items-center gap-4 mt-3">
          <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            {properties.length} properties
          </span>
          <a
            href={entity.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm transition-colors"
            style={{ color: 'var(--accent-teal)' }}
          >
            <BookOpen className="w-4 h-4" />
            View documentation
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Inheritance */}
      {entity.inheritance && entity.inheritance.length > 0 && (
        <div
          className="rounded-lg p-4"
          style={{
            background: 'var(--accent-blue-dim)',
            border: '1px solid rgba(59, 130, 246, 0.3)'
          }}
        >
          <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--accent-blue)' }}>
            Inheritance
          </h3>
          <div className="flex flex-wrap gap-2">
            {entity.inheritance.map((parent, idx) => (
              <span
                key={idx}
                className="text-sm px-2 py-1 rounded"
                style={{
                  background: 'var(--surface-default)',
                  color: 'var(--accent-blue)',
                  fontFamily: 'var(--font-mono)'
                }}
              >
                extends {parent}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Properties table with virtualization */}
      {properties.length > 0 && (
        <div>
          <h3
            className="text-lg font-semibold mb-3 flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <List className="w-5 h-5" style={{ color: 'var(--text-tertiary)' }} />
            Properties
          </h3>
          <div
            className="rounded-lg overflow-hidden"
            style={{
              border: '1px solid var(--border-subtle)',
              background: 'var(--surface-default)'
            }}
          >
            <table className="w-full">
              <thead style={{ background: 'var(--surface-dim)' }}>
                <tr>
                  <th
                    className="text-left py-3 px-4 text-sm font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Name
                  </th>
                  <th
                    className="text-left py-3 px-4 text-sm font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Type
                  </th>
                  <th
                    className="text-left py-3 px-4 text-sm font-medium"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayProperties.map((prop, idx) => (
                  <PropertyRow key={idx} property={prop} />
                ))}
              </tbody>
            </table>

            {hasMore && (
              <div
                className="px-4 py-3"
                style={{
                  background: 'var(--surface-dim)',
                  borderTop: '1px solid var(--border-subtle)'
                }}
              >
                <button
                  onClick={() => setVisibleCount(prev => prev + ITEMS_PER_PAGE)}
                  className="text-sm font-medium"
                  style={{ color: 'var(--accent-teal)' }}
                >
                  Load more ({properties.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ModelsDocs() {
  const [search, setSearch] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EntityDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [visibleEntityCount, setVisibleEntityCount] = useState(50);
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

  const data = modelsIndex as ModelsIndex;

  // Filter entities by search
  const filteredEntities = useMemo(() => {
    if (!search.trim()) return data.entities;

    const q = search.toLowerCase();
    return data.entities.filter(
      entity =>
        entity.title.toLowerCase().includes(q) ||
        entity.id.toLowerCase().includes(q) ||
        entity.searchableProps.some(p => p.toLowerCase().includes(q))
    );
  }, [data.entities, search]);

  // Paginated entities for sidebar
  const visibleEntities = useMemo(() => {
    return filteredEntities.slice(0, visibleEntityCount);
  }, [filteredEntities, visibleEntityCount]);

  // Load entity detail on selection
  useEffect(() => {
    if (!selectedEntityId) {
      setSelectedEntity(null);
      return;
    }

    setLoading(true);
    loadEntityDetail(selectedEntityId).then(detail => {
      setSelectedEntity(detail);
      setLoading(false);
    });
  }, [selectedEntityId]);

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
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleEntityCount(50); // Reset pagination on search
              }}
              placeholder="Search types & properties... (Cmd+K)"
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg transition-all focus:outline-none"
              style={{
                background: 'var(--surface-dim)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)'
              }}
            />
          </div>
          {search && (
            <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
              {filteredEntities.length} results
            </p>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2">
          {/* All Types */}
          <button
            onClick={() => setSelectedEntityId(null)}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-left transition-colors"
            style={{
              background: !selectedEntityId ? 'var(--accent-teal-dim)' : 'transparent',
              color: !selectedEntityId ? 'var(--accent-teal)' : 'var(--text-secondary)'
            }}
          >
            <Database className="w-4 h-4" />
            All Types ({data.totalEntities})
          </button>

          <div
            className="h-px my-3 mx-2"
            style={{ background: 'var(--border-subtle)' }}
          />

          {/* Entity list with virtualization */}
          <div className="space-y-0.5">
            {visibleEntities.map((entity) => (
              <button
                key={entity.id}
                onClick={() => setSelectedEntityId(entity.id)}
                className="w-full flex items-center justify-between gap-2 px-3 py-1.5 rounded text-sm text-left transition-colors"
                style={{
                  background: selectedEntityId === entity.id ? 'var(--accent-teal-dim)' : 'transparent',
                  color: selectedEntityId === entity.id ? 'var(--accent-teal)' : 'var(--text-secondary)'
                }}
              >
                <span
                  className="truncate text-xs"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {entity.title}
                </span>
                <span
                  className="text-xs shrink-0"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {entity.propertyCount}
                </span>
              </button>
            ))}
          </div>

          {/* Load more button */}
          {visibleEntityCount < filteredEntities.length && (
            <button
              onClick={() => setVisibleEntityCount(prev => prev + 50)}
              className="w-full mt-2 px-3 py-2 text-sm rounded-lg transition-colors"
              style={{ color: 'var(--accent-teal)' }}
            >
              Load more ({filteredEntities.length - visibleEntityCount} remaining)
            </button>
          )}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-10">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-teal)' }} />
            </div>
          ) : selectedEntity ? (
            <>
              {/* Breadcrumb */}
              <div
                className="flex items-center gap-2 text-sm mb-8"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <button
                  onClick={() => setSelectedEntityId(null)}
                  className="transition-colors"
                >
                  All Types
                </button>
                <ChevronRight className="w-4 h-4" />
                <span
                  style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                >
                  {selectedEntity.title}
                </span>
              </div>

              <EntityDetailView entity={selectedEntity} />
            </>
          ) : (
            <>
              <h2
                className="text-3xl font-bold mb-3"
                style={{ color: 'var(--text-primary)' }}
              >
                Atlan Data Model
              </h2>
              <p
                className="text-lg mb-10"
                style={{ color: 'var(--text-secondary)' }}
              >
                Complete reference for all Atlan entity types, their properties, and relationships.
                Use this to understand what attributes are available when creating, updating, or searching assets.
              </p>

              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <div
                  className="rounded-xl p-5"
                  style={{
                    background: 'var(--surface-default)',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: 'var(--accent-teal-dim)' }}
                    >
                      <Box className="w-5 h-5" style={{ color: 'var(--accent-teal)' }} />
                    </div>
                    <div>
                      <div
                        className="text-2xl font-bold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {data.totalEntities}
                      </div>
                      <div
                        className="text-sm"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        Entity Types
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className="rounded-xl p-5"
                  style={{
                    background: 'var(--surface-default)',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: 'var(--accent-blue-dim)' }}
                    >
                      <List className="w-5 h-5" style={{ color: 'var(--accent-blue)' }} />
                    </div>
                    <div>
                      <div
                        className="text-2xl font-bold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {data.totalProperties.toLocaleString()}
                      </div>
                      <div
                        className="text-sm"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        Properties
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick search hint */}
              <div
                className="rounded-lg p-4 mb-8"
                style={{
                  background: 'var(--accent-teal-dim)',
                  borderLeft: '3px solid var(--accent-teal)'
                }}
              >
                <h3
                  className="text-sm font-medium mb-1"
                  style={{ color: 'var(--accent-teal)' }}
                >
                  Quick Tip
                </h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Use the search box to find entities by name or property. For example, try searching for
                  "qualifiedName", "Table", or "certificateStatus".
                </p>
              </div>

              {/* Popular entities */}
              <h3
                className="text-lg font-semibold mb-4"
                style={{ color: 'var(--text-primary)' }}
              >
                Popular Entity Types
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {['table', 'column', 'database', 'schema', 'atlasglossaryterm', 'connection', 'datadomain', 'dataproduct'].map(id => {
                  const entity = data.entities.find(e => e.id === id);
                  if (!entity) return null;
                  return (
                    <button
                      key={id}
                      onClick={() => setSelectedEntityId(id)}
                      className="flex items-center gap-3 p-4 rounded-xl text-left transition-all duration-200 group"
                      style={{
                        background: 'var(--surface-default)',
                        border: '1px solid var(--border-subtle)'
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: 'var(--accent-teal-dim)' }}
                      >
                        <Box className="w-5 h-5" style={{ color: 'var(--accent-teal)' }} />
                      </div>
                      <div>
                        <h4
                          className="font-semibold text-sm"
                          style={{
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-mono)'
                          }}
                        >
                          {entity.title}
                        </h4>
                        <p
                          className="text-xs"
                          style={{ color: 'var(--text-tertiary)' }}
                        >
                          {entity.propertyCount} properties
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
    </div>
  );
}
