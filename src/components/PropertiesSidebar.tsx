import { useState, useEffect, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Lock,
  ExternalLink,
  Box,
  Sparkles,
  Layers,
  Loader2,
} from 'lucide-react';

// Types
interface Property {
  name: string;
  type: string;
  readOnly: boolean;
  description?: string;
}

interface EntityDetail {
  id: string;
  title: string;
  url: string;
  description?: string;
  inheritance?: string[];
  properties?: Property[];
}

interface PropertiesSidebarProps {
  relatedTypes: string[];
}

// Cache for loaded entity details
const entityCache = new Map<string, EntityDetail>();
// Special cache for asset properties (for comparison)
let assetPropertiesSet: Set<string> | null = null;

async function loadEntityDetail(entityId: string): Promise<EntityDetail | null> {
  const normalizedId = entityId.toLowerCase();
  
  if (entityCache.has(normalizedId)) {
    return entityCache.get(normalizedId)!;
  }
  
  try {
    const response = await fetch(`/models/${normalizedId}.json`);
    if (!response.ok) throw new Error('Not found');
    const data = await response.json();
    entityCache.set(normalizedId, data);
    return data;
  } catch (error) {
    console.error(`Failed to load entity ${entityId}:`, error);
    return null;
  }
}

async function getAssetPropertyNames(): Promise<Set<string>> {
  if (assetPropertiesSet) return assetPropertiesSet;
  
  const assetEntity = await loadEntityDetail('asset');
  if (assetEntity?.properties) {
    assetPropertiesSet = new Set(assetEntity.properties.map(p => p.name));
  } else {
    assetPropertiesSet = new Set();
  }
  return assetPropertiesSet;
}

// Type badge colors
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100"
      style={{ background: copied ? 'var(--accent-emerald-dim)' : 'transparent' }}
      title="Copy property name"
    >
      {copied ? (
        <Check className="w-3 h-3" style={{ color: 'var(--accent-emerald)' }} />
      ) : (
        <Copy className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
      )}
    </button>
  );
}

function PropertyItem({ property, isTypeSpecific }: { property: Property; isTypeSpecific?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const typeStyle = TYPE_COLORS[property.type] || TYPE_COLORS.unknown;
  
  return (
    <div 
      className="group"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      <div
        onClick={() => property.description && setExpanded(!expanded)}
        className="w-full flex items-center gap-2 py-2 px-3 text-left transition-colors hover:bg-opacity-50"
        style={{ 
          background: expanded ? 'var(--surface-hover)' : 'transparent',
          cursor: property.description ? 'pointer' : 'default'
        }}
        role="button"
        tabIndex={property.description ? 0 : -1}
        onKeyDown={(e) => {
          if (property.description && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        {property.description ? (
          expanded ? (
            <ChevronDown className="w-3 h-3 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          ) : (
            <ChevronRight className="w-3 h-3 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          )
        ) : (
          <div className="w-3" />
        )}
        
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          {isTypeSpecific && (
            <Sparkles className="w-3 h-3 shrink-0" style={{ color: 'var(--accent-teal)' }} title="Type-specific property" />
          )}
          <span 
            className="text-xs truncate"
            style={{ 
              fontFamily: 'var(--font-mono)',
              color: isTypeSpecific ? 'var(--accent-teal)' : 'var(--text-primary)'
            }}
          >
            {property.name}
          </span>
          <CopyButton text={property.name} />
          {property.readOnly && (
            <Lock className="w-2.5 h-2.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} title="Read-only" />
          )}
        </div>
        
        <span 
          className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
          style={{ background: typeStyle.bg, color: typeStyle.text }}
        >
          {property.type}
        </span>
      </div>
      
      {expanded && property.description && (
        <div 
          className="px-3 pb-2 pl-8"
        >
          <p 
            className="text-xs leading-relaxed"
            style={{ color: 'var(--text-secondary)' }}
          >
            {property.description}
          </p>
        </div>
      )}
    </div>
  );
}

function TypeSection({ 
  entity, 
  assetPropertyNames,
  defaultExpanded = false 
}: { 
  entity: EntityDetail; 
  assetPropertyNames: Set<string>;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  // Separate type-specific vs inherited properties
  const { typeSpecific, inherited } = useMemo(() => {
    if (!entity.properties) return { typeSpecific: [], inherited: [] };
    
    const specific: Property[] = [];
    const inherit: Property[] = [];
    
    for (const prop of entity.properties) {
      // If it's not in Asset, it's type-specific
      if (!assetPropertyNames.has(prop.name)) {
        specific.push(prop);
      } else {
        inherit.push(prop);
      }
    }
    
    return { typeSpecific: specific, inherited: inherit };
  }, [entity.properties, assetPropertyNames]);
  
  const [showAllInherited, setShowAllInherited] = useState(false);
  const INITIAL_INHERITED_COUNT = 5;
  const visibleInherited = showAllInherited ? inherited : inherited.slice(0, INITIAL_INHERITED_COUNT);
  
  return (
    <div 
      className="rounded-lg overflow-hidden"
      style={{ 
        background: 'var(--surface-default)',
        border: '1px solid var(--border-subtle)'
      }}
    >
      {/* Type Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-3 text-left transition-colors"
        style={{ 
          background: 'var(--surface-dim)',
          borderBottom: expanded ? '1px solid var(--border-subtle)' : 'none'
        }}
      >
        <Box className="w-4 h-4" style={{ color: 'var(--accent-teal)' }} />
        <span 
          className="flex-1 text-sm font-medium"
          style={{ 
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-primary)'
          }}
        >
          {entity.title}
        </span>
        <span 
          className="text-xs"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {entity.properties?.length || 0}
        </span>
        {expanded ? (
          <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
        ) : (
          <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
        )}
      </button>
      
      {expanded && (
        <div>
          {/* Type-specific properties */}
          {typeSpecific.length > 0 && (
            <div>
              <div 
                className="flex items-center gap-2 px-3 py-2"
                style={{ 
                  background: 'var(--accent-teal-dim)',
                  borderBottom: '1px solid var(--border-subtle)'
                }}
              >
                <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--accent-teal)' }} />
                <span 
                  className="text-xs font-medium"
                  style={{ color: 'var(--accent-teal)' }}
                >
                  {entity.title}-specific ({typeSpecific.length})
                </span>
              </div>
              <div>
                {typeSpecific.map((prop) => (
                  <PropertyItem key={prop.name} property={prop} isTypeSpecific />
                ))}
              </div>
            </div>
          )}
          
          {/* Inherited properties */}
          {inherited.length > 0 && (
            <div>
              <div 
                className="flex items-center gap-2 px-3 py-2"
                style={{ 
                  background: 'var(--surface-bright)',
                  borderBottom: '1px solid var(--border-subtle)'
                }}
              >
                <Layers className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
                <span 
                  className="text-xs font-medium"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  Inherited from Asset ({inherited.length})
                </span>
              </div>
              <div>
                {visibleInherited.map((prop) => (
                  <PropertyItem key={prop.name} property={prop} />
                ))}
                {inherited.length > INITIAL_INHERITED_COUNT && (
                  <button
                    onClick={() => setShowAllInherited(!showAllInherited)}
                    className="w-full px-3 py-2 text-xs font-medium transition-colors text-left"
                    style={{ color: 'var(--accent-teal)' }}
                  >
                    {showAllInherited 
                      ? 'Show less' 
                      : `Show ${inherited.length - INITIAL_INHERITED_COUNT} more inherited properties`}
                  </button>
                )}
              </div>
            </div>
          )}
          
          {/* Link to full docs */}
          <a
            href={entity.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 text-xs transition-colors"
            style={{ 
              color: 'var(--accent-teal)',
              background: 'var(--surface-dim)',
              borderTop: '1px solid var(--border-subtle)'
            }}
          >
            View full {entity.title} documentation
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}

export function PropertiesSidebar({ relatedTypes }: PropertiesSidebarProps) {
  const [entities, setEntities] = useState<EntityDetail[]>([]);
  const [assetPropertyNames, setAssetPropertyNames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (relatedTypes.length === 0) {
      setEntities([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    Promise.all([
      getAssetPropertyNames(),
      ...relatedTypes.map(type => loadEntityDetail(type))
    ]).then(([assetProps, ...loadedEntities]) => {
      setAssetPropertyNames(assetProps);
      setEntities(loadedEntities.filter((e): e is EntityDetail => e !== null));
      setLoading(false);
    });
  }, [relatedTypes]);
  
  if (relatedTypes.length === 0) {
    return null;
  }
  
  return (
    <aside 
      className="w-80 border-l shrink-0 hidden xl:flex flex-col"
      style={{ 
        background: 'var(--bg-secondary)',
        borderColor: 'var(--border-subtle)'
      }}
    >
      {/* Header */}
      <div 
        className="p-4 border-b"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <h3 
          className="text-sm font-semibold flex items-center gap-2"
          style={{ color: 'var(--text-primary)' }}
        >
          <Box className="w-4 h-4" style={{ color: 'var(--accent-teal)' }} />
          Related Types
        </h3>
        <p 
          className="text-xs mt-1"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Properties for asset types used in this use case
        </p>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent-teal)' }} />
          </div>
        ) : entities.length === 0 ? (
          <p 
            className="text-sm text-center py-10"
            style={{ color: 'var(--text-tertiary)' }}
          >
            No type information available
          </p>
        ) : (
          entities.map((entity) => (
            <TypeSection 
              key={entity.id} 
              entity={entity}
              assetPropertyNames={assetPropertyNames}
              defaultExpanded={entities.length === 1}
            />
          ))
        )}
      </div>
    </aside>
  );
}
