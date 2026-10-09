import { Link, useNavigate } from 'react-router';
import { APP_VERSION, post } from '../api';
import { useI18n, type Key } from '../i18n';
import { useSession } from '../session';

const ADMIN: [string, Key][] = [
  ['/more/settings', 'more.settings'],
  ['/more/work-types', 'more.workTypes'],
  ['/more/templates', 'more.templates'],
  ['/more/import', 'more.import'],
  ['/more/locations', 'more.locations'],
];
const ALL: [string, Key][] = [
  ['/more/map', 'more.map'],
  ['/more/inventory', 'more.inventory'],
  ['/more/suppliers', 'more.suppliers'],
  ['/more/invoices', 'more.invoices'],
  ['/more/notifications', 'more.notifications'],
  ['/more/account', 'more.account'],
  ['/privacy', 'more.privacy'],
];

export function More() {
  const { t } = useI18n();
  const { user, refresh } = useSession();
  const nav = useNavigate();
  const items = [...(user?.role === 'admin' ? ADMIN : []), ...ALL];
  return (
    <>
      <h1>{t('more.title')}</h1>
      <ul className="list">
        {items.map(([to, k]) => (
          <li key={to}>
            <Link className="item" to={to}>
              <span className="item-title">{t(k)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="row between">
        <span className="muted small">
          {user?.name} — {t('app.version', { v: APP_VERSION })}
        </span>
        <button
          className="btn"
          onClick={async () => {
            await post('/auth/logout').catch(() => {});
            await refresh();
            nav('/login');
          }}
        >
          {t('auth.logout')}
        </button>
      </div>
    </>
  );
}
