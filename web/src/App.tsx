import { useCallback, useEffect, useState } from 'react';
import { api, clearToken, initToken, type SearchItem } from './api';
import { FilterBuilder } from './FilterBuilder';
import { Landing } from './Landing';

type AuthState = 'checking' | 'in' | 'out';

export function App() {
  const [auth, setAuth] = useState<AuthState>('checking');
  const [firstName, setFirstName] = useState('');
  const [searches, setSearches] = useState<SearchItem[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    api.listSearches().then(setSearches).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!initToken()) {
      setAuth('out');
      return;
    }
    api
      .me()
      .then((me) => {
        setFirstName(me.firstName);
        setAuth('in');
        refresh();
      })
      .catch(() => setAuth('out'));
  }, [refresh]);

  if (auth === 'checking') {
    return <div className="center muted">Učitavam...</div>;
  }

  if (auth === 'out') {
    return <Landing />;
  }

  return (
    <div className="container">
      <h1>🔔 KP Notify</h1>
      <p className="muted">Zdravo{firstName ? `, ${firstName}` : ''}! Ovde upravljaš svojim pretragama.</p>

      {error && <p className="error">{error}</p>}

      {showBuilder ? (
        <>
          <h2>Nova pretraga</h2>
          <FilterBuilder
            onSaved={() => {
              setShowBuilder(false);
              refresh();
            }}
          />
          <button className="secondary" onClick={() => setShowBuilder(false)}>Otkaži</button>
        </>
      ) : (
        <button onClick={() => setShowBuilder(true)}>+ Nova pretraga</button>
      )}

      <h2>Tvoje pretrage {searches.length > 0 && <span className="badge">{searches.length}</span>}</h2>
      {searches.length === 0 && !showBuilder && (
        <p className="muted">Još nema nijedne — napravi prvu dugmetom iznad.</p>
      )}
      {searches.map((s) => (
        <div className="card search-item" key={s.id}>
          <div className="info">
            <div className="name">{s.isEnabled ? '🔔' : '🔕'} {s.name}</div>
            <div className="muted">
              {describeParams(s.params)}
              {s.lastNotifiedAt &&
                ` · poslednje obaveštenje ${new Date(s.lastNotifiedAt).toLocaleString('sr-RS')}`}
            </div>
          </div>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <label className="toggle" title={s.isEnabled ? 'Isključi obaveštenja' : 'Uključi obaveštenja'}>
              <input
                type="checkbox"
                checked={s.isEnabled}
                onChange={(e) =>
                  api.toggleSearch(s.id, e.target.checked).then(refresh).catch((err) => setError(err.message))
                }
              />
              <span />
            </label>
            <button
              className="danger"
              onClick={() => {
                if (confirm(`Obrisati pretragu „${s.name}"?`)) {
                  api.deleteSearch(s.id).then(refresh).catch((err) => setError(err.message));
                }
              }}
            >
              Obriši
            </button>
          </div>
        </div>
      ))}

      <p className="muted" style={{ marginTop: 24 }}>
        Odjava iz ovog browsera:{' '}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            clearToken();
            location.reload();
          }}
        >
          odjavi me
        </a>
      </p>
    </div>
  );
}

const PARAM_LABELS: Record<string, string> = {
  categoryId: 'kategorija',
  groupId: 'podgrupa',
  keywords: 'reči',
  priceFrom: 'od',
  priceTo: 'do',
  currency: '',
  locationIds: 'mesto',
  condition: 'stanje',
  hasPhoto: 'sa slikom',
  hasPrice: 'sa cenom',
};

function describeParams(params: Record<string, string>): string {
  const parts: string[] = [];
  if (params.keywords) {
    parts.push(`„${params.keywords}"${params.keywordsScope === 'description' ? ' (i u opisu)' : ''}`);
  }
  if (params.priceFrom || params.priceTo) {
    const cur = (params.currency ?? 'eur').toUpperCase();
    parts.push(`${params.priceFrom ?? '0'}–${params.priceTo ?? '∞'} ${cur}`);
  }
  for (const [k, v] of Object.entries(params)) {
    if (['keywords', 'keywordsScope', 'priceFrom', 'priceTo', 'currency'].includes(k)) continue;
    const label = PARAM_LABELS[k];
    if (label === undefined) parts.push(`${k}=${v}`);
    else if (label && ['hasPhoto', 'hasPrice'].includes(k)) parts.push(label);
    else if (label) parts.push(`${label}: ${v}`);
  }
  return parts.join(' · ') || 'bez filtera';
}
