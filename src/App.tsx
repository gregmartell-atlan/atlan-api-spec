import { Suspense, lazy, useEffect } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Zap } from 'lucide-react';

const ApiDocs = lazy(() => import('./components/ApiDocs').then((m) => ({ default: m.ApiDocs })));
const UseCaseDocs = lazy(() => import('./components/UseCaseDocs').then((m) => ({ default: m.UseCaseDocs })));
const ModelsDocs = lazy(() => import('./components/ModelsDocs').then((m) => ({ default: m.ModelsDocs })));

function LoadingSpinner() {
  return (
    <div className="h-full flex flex-col items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center animate-pulse"
          style={{
            background: 'var(--gradient-teal)',
            boxShadow: 'var(--shadow-glow-teal)'
          }}
        >
          <Zap className="w-8 h-8 text-white" />
        </div>
        <div className="absolute -inset-4 border-2 border-teal-500/20 rounded-3xl animate-[spin_3s_linear_infinite]" />
      </div>
      <span className="mt-6 text-sm font-medium tracking-widest uppercase opacity-70" style={{ color: 'var(--text-secondary)' }}>
        Loading
      </span>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

function App() {
  return (
    <HashRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route
            index
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <UseCaseDocs />
              </Suspense>
            }
          />
          <Route
            path="models"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <ModelsDocs />
              </Suspense>
            }
          />
          <Route
            path="endpoints"
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <ApiDocs />
              </Suspense>
            }
          />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
