import { CopyButton } from './CopyButton';

interface CodeBlockProps {
  code: string;
  title?: string;
  language?: string;
}

export function CodeBlock({ code, title, language = 'json' }: CodeBlockProps) {
  const formatted = typeof code === 'string' ? code : JSON.stringify(code, null, 2);

  return (
    <div className="relative group rounded-lg overflow-hidden">
      {title && (
        <div className="bg-slate-800 px-4 py-2 text-xs text-slate-400 font-medium border-b border-slate-700">
          {title}
        </div>
      )}
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <CopyButton text={formatted} />
      </div>
      <pre className="bg-slate-900 text-slate-100 p-4 overflow-x-auto text-sm font-mono">
        <code className={`language-${language}`}>{formatted}</code>
      </pre>
    </div>
  );
}

interface MethodBadgeProps {
  method: string;
}

export function MethodBadge({ method }: MethodBadgeProps) {
  const colors: Record<string, string> = {
    GET: 'bg-blue-500',
    POST: 'bg-teal-500',
    PUT: 'bg-amber-500',
    PATCH: 'bg-orange-500',
    DELETE: 'bg-red-500',
  };

  return (
    <span
      className={`${colors[method] || 'bg-slate-500'} text-white text-xs font-bold px-2 py-1 rounded uppercase tracking-wide`}
    >
      {method}
    </span>
  );
}
