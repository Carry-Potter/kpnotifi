/**
 * Builder filtera: kategorija → grupe + osnovni filteri (cena, lokacija,
 * stanje...) ili nalepljen KP link. Pre snimanja pokazuje probni rezultat.
 */
import { useEffect, useMemo, useState } from 'react';
import { api, type Category, type Group, type Location, type Preview } from './api';

const CONDITIONS = [
  { id: 'new', label: 'Novo' },
  { id: 'as-new', label: 'Nekorišćeno (polovno)' },
  { id: 'used', label: 'Korišćeno (polovno)' },
  { id: 'damaged', label: 'Oštećeno ili neispravno' },
];

interface Props {
  onSaved: () => void;
}

export function FilterBuilder({ onSaved }: Props) {
  const [mode, setMode] = useState<'builder' | 'url'>('builder');
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  const [name, setName] = useState('');
  const [kpUrl, setKpUrl] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [keywords, setKeywords] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [priceTo, setPriceTo] = useState('');
  const [currency, setCurrency] = useState('eur');
  const [locationId, setLocationId] = useState('');
  const [conditions, setConditions] = useState<string[]>([]);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [hasPrice, setHasPrice] = useState(false);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.categories().then(setCategories).catch(() => {});
    api.locations().then(setLocations).catch(() => {});
  }, []);

  useEffect(() => {
    setGroupIds([]);
    setGroups([]);
    if (!categoryId) return;
    setGroupsLoading(true);
    api
      .groups(Number(categoryId))
      .then(setGroups)
      .catch(() => {})
      .finally(() => setGroupsLoading(false));
  }, [categoryId]);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (categoryId) p.categoryId = categoryId;
    if (groupIds.length) p.groupId = groupIds.join(',');
    if (keywords.trim()) p.keywords = keywords.trim();
    if (priceFrom) p.priceFrom = priceFrom;
    if (priceTo) p.priceTo = priceTo;
    if (priceFrom || priceTo) p.currency = currency;
    if (locationId) p.locationIds = locationId;
    if (conditions.length) p.condition = conditions.join(',');
    if (hasPhoto) p.hasPhoto = 'yes';
    if (hasPrice) p.hasPrice = 'yes';
    return p;
  }, [categoryId, groupIds, keywords, priceFrom, priceTo, currency, locationId, conditions, hasPhoto, hasPrice]);

  const input = mode === 'url' ? { kpUrl: kpUrl.trim() } : { params };
  const canPreview = mode === 'url' ? kpUrl.trim().length > 0 : Object.keys(params).length > 0;

  async function doPreview() {
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      setPreview(await api.preview(input));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function doSave() {
    setBusy(true);
    setError('');
    try {
      const fallbackName =
        preview?.filterName ||
        categories.find((c) => String(c.id) === categoryId)?.name ||
        'Pretraga';
      await api.createSearch({ name: name.trim() || fallbackName, ...input });
      onSaved();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="tabs">
        <button className={mode === 'builder' ? 'active' : ''} onClick={() => setMode('builder')}>
          Sastavi filter
        </button>
        <button className={mode === 'url' ? 'active' : ''} onClick={() => setMode('url')}>
          Nalepi KP link
        </button>
      </div>

      {mode === 'url' ? (
        <>
          <label>Link stranice pretrage sa kupujemprodajem.com</label>
          <input
            value={kpUrl}
            onChange={(e) => setKpUrl(e.target.value)}
            placeholder="https://www.kupujemprodajem.com/pretraga?categoryId=..."
          />
          <p className="muted">
            Podesi filtere na KP sajtu (i one najsitnije — godište, model, kilometraža...), pa
            kopiraj adresu iz browsera ovde. Svi filteri se prenose.
          </p>
        </>
      ) : (
        <>
          <label>Šta tražiš? (ključne reči)</label>
          <input
            autoFocus
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="npr. iphone 15 pro, golf 7, stan novi sad..."
          />

          <label>Kategorija (nije obavezna — sužava pretragu)</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— sve kategorije —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {categoryId && (
            <div>
              <label>
                Podgrupa {groupsLoading ? '(učitavam...)' : groups.length ? `(${groups.length}) — više izbora uz Ctrl` : ''}
              </label>
              {groups.length > 0 && (
                <select
                  multiple
                  value={groupIds}
                  onChange={(e) =>
                    setGroupIds(Array.from(e.target.selectedOptions).map((o) => o.value))
                  }
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="row">
            <div className="grow">
              <label>Cena od</label>
              <input inputMode="numeric" value={priceFrom} onChange={(e) => setPriceFrom(e.target.value.replace(/\D/g, ''))} />
            </div>
            <div className="grow">
              <label>Cena do</label>
              <input inputMode="numeric" value={priceTo} onChange={(e) => setPriceTo(e.target.value.replace(/\D/g, ''))} />
            </div>
            <div className="grow">
              <label>Valuta</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="eur">EUR</option>
                <option value="rsd">RSD</option>
              </select>
            </div>
          </div>

          <div className="row">
            <div className="grow">
              <label>Mesto</label>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">Cela Srbija</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div className="grow">
              <label>Stanje (više izbora uz Ctrl)</label>
              <select
                multiple
                value={conditions}
                onChange={(e) =>
                  setConditions(Array.from(e.target.selectedOptions).map((o) => o.value))
                }
              >
                {CONDITIONS.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            <label style={{ margin: 0 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={hasPhoto} onChange={(e) => setHasPhoto(e.target.checked)} /> samo sa slikom
            </label>
            <label style={{ margin: 0 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={hasPrice} onChange={(e) => setHasPrice(e.target.checked)} /> samo sa cenom
            </label>
          </div>
          <p className="muted">
            Za filtere specifične za kategoriju (godište, model auta...) koristi „Nalepi KP link" —
            prenosi apsolutno sve filtere sa KP-a.
          </p>
        </>
      )}

      <label>Naziv pretrage (za tebe i za poruke u Telegramu)</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="npr. iPhone 15 do 600e" />

      {error && <p className="error">{error}</p>}

      <div className="row" style={{ marginTop: 12 }}>
        <button className="secondary" disabled={!canPreview || busy} onClick={doPreview}>
          {busy ? 'Proveravam...' : 'Proveri filter'}
        </button>
        <button disabled={!canPreview || busy || !preview} onClick={doSave}>
          Sačuvaj pretragu
        </button>
      </div>

      {preview && (
        <div style={{ marginTop: 12 }}>
          <p>
            <span className="badge">{preview.total.toLocaleString('sr-RS')} oglasa trenutno</span>{' '}
            <span className="muted">{preview.filterName}</span>
          </p>
          {preview.total > 10000 ? (
            <p className="error">
              Filter pogađa preko 10.000 oglasa — snimanje će biti odbijeno. Dodaj kategoriju,
              cenu ili preciznije ključne reči.
            </p>
          ) : preview.total > 3000 ? (
            <p className="error">
              Filter je vrlo širok — stizaće mnogo obaveštenja. Razmisli o sužavanju.
            </p>
          ) : null}
          <div className="sample">
            {preview.sample.map((s) => (
              <a key={s.id} href={`https://www.kupujemprodajem.com${s.adUrl}`} target="_blank" rel="noreferrer">
                {s.image ? <img src={s.image} alt="" loading="lazy" /> : <div style={{ height: 96 }} />}
                <span className="t">
                  <b>{s.priceText}</b><br />{s.name}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
