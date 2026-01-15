import { NavLink, Outlet } from 'react-router-dom';
import { BookOpen, Database, Code2, Zap, Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme';

const NAV_ITEMS = [
  { to: '/', label: 'Use Cases', icon: BookOpen },
  { to: '/models', label: 'Data Model', icon: Database },
  { to: '/endpoints', label: 'Endpoints', icon: Code2 },
] as const;

export function Layout() {
  const { theme, toggleTheme, isDark } = useTheme();
  
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Top Navigation Bar */}
      <header 
        className="h-14 flex items-center px-6 gap-6 shrink-0 sticky top-0 z-50 glass-panel"
        style={{ 
          borderTop: 'none',
          borderLeft: 'none',
          borderRight: 'none'
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 group cursor-pointer">
          <div 
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110"
            style={{ 
              background: 'var(--gradient-teal)',
              boxShadow: 'var(--shadow-glow-teal)'
            }}
          >
            <Zap className="w-5 h-5" style={{ color: 'var(--bg-primary)' }} />
          </div>
          <div className="flex flex-col">
            <h1 
              className="text-base font-bold leading-tight tracking-tight text-gradient"
            >
              Atlan API
            </h1>
            <span 
              className="text-[10px] uppercase tracking-widest font-bold opacity-70"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Reference
            </span>
          </div>
        </div>

        {/* Separator */}
        <div 
          className="w-px h-6"
          style={{ background: 'var(--border-default)' }}
        />

        {/* Navigation */}
        <nav className="flex gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  isActive ? '' : 'hover:bg-opacity-50'
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? 'var(--accent-teal-dim)' : 'transparent',
                color: isActive ? 'var(--accent-teal)' : 'var(--text-secondary)',
              })}
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 group"
            style={{ 
              background: 'var(--surface-dim)',
              border: '1px solid var(--border-subtle)'
            }}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <Sun 
                className="w-4 h-4 transition-transform duration-200 group-hover:rotate-12" 
                style={{ color: 'var(--accent-amber)' }} 
              />
            ) : (
              <Moon 
                className="w-4 h-4 transition-transform duration-200 group-hover:-rotate-12" 
                style={{ color: 'var(--accent-purple)' }} 
              />
            )}
          </button>
          
          {/* Version badge */}
          <span 
            className="px-2 py-1 text-xs font-medium rounded"
            style={{ 
              background: 'var(--surface-bright)',
              color: 'var(--text-tertiary)'
            }}
          >
            v1.0
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
