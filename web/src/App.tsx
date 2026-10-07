import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import { onAuthLost, onVersionMismatch, patch } from './api';
import { IconAgenda, IconClients, IconMore, IconOrders, IconToday } from './components/icons';
import { ErrorBoundary, Loading, ToastProvider } from './components/ui';
import { I18nProvider, LANGS, useI18n, type Lang } from './i18n';
import { SessionProvider, useSession } from './session';
import { Forgot, Login, Reset, Setup } from './pages/Auth';
import { Today } from './pages/Today';
import { Agenda } from './pages/Agenda';
import { Orders } from './pages/Orders';
import { OrderDetail } from './pages/OrderDetail';
import { Intake } from './pages/Intake';
import { Clients, ClientDetail } from './pages/Clients';
import { More } from './pages/More';
import { Settings } from './pages/Settings';
import { WorkTypes, Suppliers } from './pages/Catalog';
import { Templates } from './pages/Templates';
import { Import } from './pages/Import';
import { Notifications } from './pages/Notifications';
import { Invoices } from './pages/Invoices';
import { Account } from './pages/Account';
import { Privacy } from './pages/Privacy';
import { Portal } from './pages/portal/Portal';
import { PortalLogin } from './pages/portal/PortalLogin';

export function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <select aria-label={t('common.language')} value={lang} onChange={(e) => setLang(e.target.value as Lang)} style={{ width: 'auto', minHeight: 40 }}>
      {LANGS.map((l) => (
        <option key={l} value={l}>
          {l.toUpperCase()}
        </option>
      ))}
    </select>
  );
}

function Banners() {
  const { t } = useI18n();
  const [online, setOnline] = useState(navigator.onLine);
  const [newVersion, setNewVersion] = useState<string | null>(null);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const unsub = onVersionMismatch(setNewVersion);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      unsub();
    };
  }, []);
  return (
    <>
      {!online && <div className="banner off" role="status">{t('app.offline')}</div>}
      {newVersion && (
        <div className="banner warn" role="status">
          <span>{t('app.versionMismatch', { server: newVersion })}</span>
          <button className="btn small" onClick={() => location.reload()}>
            {t('app.reload')}
          </button>
        </div>
      )}
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { shop } = useSession();
  const loc = useLocation();
  return (
    <div className="shell">
      <header className="topbar">
        <span className="shop">{shop?.shop_name ?? 'TallerPro'}</span>
        <LangSwitch />
      </header>
      <nav className="tabbar" aria-label="TallerPro">
        <NavLink to="/" end>
          <IconToday />
          {t('nav.today')}
        </NavLink>
        <NavLink to="/agenda">
          <IconAgenda />
          {t('nav.agenda')}
        </NavLink>
        <NavLink to="/orders" aria-current={loc.pathname.startsWith('/orders') || loc.pathname.startsWith('/intake') ? 'page' : undefined}>
          <IconOrders />
          {t('nav.orders')}
        </NavLink>
        <NavLink to="/clients">
          <IconClients />
          {t('nav.clients')}
        </NavLink>
        <NavLink to="/more">
          <IconMore />
          {t('nav.more')}
        </NavLink>
      </nav>
      <div>
        <Banners />
        <ErrorBoundary where={loc.pathname} key={loc.pathname}>
          <main className="main">{children}</main>
        </ErrorBoundary>
      </div>
    </div>
  );
}

function Private() {
  const s = useSession();
  const nav = useNavigate();
  useEffect(() => onAuthLost(() => s.setAnon()), [s]);
  if (s.state === 'loading') return <div className="main"><Loading /></div>;
  if (s.state === 'setup') return <Navigate to="/setup" replace />;
  if (s.state === 'anon') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  void nav;
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/orders" element={<Orders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/intake" element={<Intake />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:id" element={<ClientDetail />} />
        <Route path="/more" element={<More />} />
        <Route path="/more/settings" element={<Settings />} />
        <Route path="/more/work-types" element={<WorkTypes />} />
        <Route path="/more/suppliers" element={<Suppliers />} />
        <Route path="/more/templates" element={<Templates />} />
        <Route path="/more/import" element={<Import />} />
        <Route path="/more/notifications" element={<Notifications />} />
        <Route path="/more/invoices" element={<Invoices />} />
        <Route path="/more/account" element={<Account />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

function Root() {
  const s = useSession();
  // El idioma elegido se recuerda también en la cuenta.
  return (
    <I18nProvider onChange={(l) => s.user && void patch('/auth/me', { lang: l }).catch(() => {})}>
      <ToastProvider>
        <ErrorBoundary where="TallerPro">
          <Routes>
            <Route path="/p/:token" element={<Portal />} />
            <Route path="/portal" element={<PortalLogin />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/reset" element={<Reset />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot" element={<Forgot />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/*" element={<Private />} />
          </Routes>
        </ErrorBoundary>
      </ToastProvider>
    </I18nProvider>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Root />
      </SessionProvider>
    </BrowserRouter>
  );
}
