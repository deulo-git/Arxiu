import { Navigate, Route, Routes, useLocation } from 'react-router';
import { useSession, LibraryProvider } from './state.tsx';
import { ConfirmEmail, Forgot, Login, Reset, Setup, TwoFactor } from './auth/AuthPages.tsx';
import { Shell } from './app/Shell.tsx';
import { Library } from './app/Library.tsx';
import { Viewer } from './app/Viewer.tsx';
import { Settings } from './app/Settings.tsx';

export function App() {
  const { status } = useSession();
  const location = useLocation();

  if (!status) {
    return (
      <div className="center-screen" aria-busy="true">
        <div className="spinner" aria-label="Carregant" />
      </div>
    );
  }

  if (status.stage !== 'full') {
    const from = location.pathname.startsWith('/entra') ? '/' : location.pathname + location.search;
    return (
      <Routes>
        <Route path="/configura" element={<Setup />} />
        <Route path="/entra" element={status.configured ? <Login /> : <Setup />} />
        <Route path="/entra/verificacio" element={status.stage === 'mfa' ? <TwoFactor /> : <Navigate to="/entra" replace />} />
        <Route path="/recupera" element={<Forgot />} />
        <Route path="/restableix" element={<Reset />} />
        <Route path="/confirma-correu" element={<ConfirmEmail />} />
        <Route path="*" element={<Navigate to="/entra" replace state={{ from }} />} />
      </Routes>
    );
  }

  return (
    <LibraryProvider>
      <Routes>
        <Route path="/confirma-correu" element={<ConfirmEmail />} />
        <Route element={<Shell />}>
          <Route index element={<Library />} />
          <Route path="/document/:id" element={<Viewer />} />
          <Route path="/ajustos" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to={(location.state as { from?: string } | null)?.from ?? '/'} replace />} />
      </Routes>
    </LibraryProvider>
  );
}
