import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppState';
import { catalogApi } from '../../app/catalogClient';
import { Link, useQueryParam } from '../../app/router';
import { culminationAltitudeDeg } from '../../astro/visibility';
import type { CatalogueFilter, CatalogueGroup, CatalogueSort } from '../../catalog/catalogStore';
import { CONSTELLATIONS } from '../../catalog/constellations';
import type { DsoSummary } from '../../catalog/types';
import { useI18n } from '../../i18n/i18n';
import type { TKey } from '../../i18n/i18n';
import { Checkbox, EmptyState, Field, NumberInput, Spinner } from '../../ui/controls';
import { VirtualList } from '../../ui/VirtualList';
import { CATEGORY_KEYS, typesForCategories } from '../common/typeCategories';
import type { TypeCategory } from '../common/typeCategories';

const PAGE = 150;

export function ExplorePage() {
  const { t, fmtNumber } = useI18n();
  const app = useApp();
  const [q, setQ] = useQueryParam('q');
  const [input, setInput] = useState(q ?? '');
  const [group, setGroup] = useState<CatalogueGroup>('all');
  const [cats, setCats] = useState<TypeCategory[]>([]);
  const [constellation, setConstellation] = useState('');
  const [magMax, setMagMax] = useState<number | null>(null);
  const [sizeMin, setSizeMin] = useState<number | null>(null);
  const [visibleOnly, setVisibleOnly] = useState(true);
  const [includeNonDso, setIncludeNonDso] = useState(false);
  const [sort, setSort] = useState<CatalogueSort>('relevance');
  const [items, setItems] = useState<DsoSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setQ(input.trim() ? input : null), 200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const filter: CatalogueFilter = {
    group,
    types: typesForCategories(cats),
    constellation: constellation || null,
    magMax,
    includeUnknownMag: magMax == null,
    sizeMinArcmin: sizeMin,
    latitudeDeg: visibleOnly && app.location ? app.location.latDeg : null,
    minAltDeg: app.settings.scoring.minAltitudeDeg,
    dsoOnly: !includeNonDso,
  };
  const filterKey = JSON.stringify(filter);

  useEffect(() => {
    if (!app.catalogue.ready) return;
    let alive = true;
    setLoading(true);
    const run = q?.trim()
      ? catalogApi()
          .search(q, 300, filter)
          .then((r) => ({ total: r.length, items: r }))
      : catalogApi().browse(filter, sort, 0, PAGE);
    run.then((r) => {
      if (!alive) return;
      setItems(r.items);
      setTotal(r.total);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filterKey, sort, app.catalogue.ready]);

  const loadMore = async () => {
    const r = await catalogApi().browse(filter, sort, items.length, PAGE);
    setItems((x) => [...x, ...r.items]);
  };

  return (
    <div>
      <div className="page-header">
        <h1>{t('explore.title')}</h1>
        <p>{t('explore.subtitle')}</p>
      </div>
      <section className="card">
        <label className="visually-hidden" htmlFor="explore-search">
          {t('common.search')}
        </label>
        <input
          id="explore-search"
          type="search"
          value={input}
          placeholder={t('explore.searchPlaceholder')}
          onChange={(e) => setInput(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <div className="row" style={{ marginTop: '0.6rem' }}>
          {CATEGORY_KEYS.map((c) => (
            <button
              key={c}
              type="button"
              className="chip"
              aria-pressed={cats.includes(c)}
              onClick={() => setCats((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]))}
            >
              {t(`controls.categories.${c}` as TKey)}
            </button>
          ))}
        </div>
        <details style={{ marginTop: '0.6rem' }}>
          <summary className="small">{t('controls.filters')}</summary>
          <div className="form-grid" style={{ marginTop: '0.5rem' }}>
            <Field label={t('controls.group')}>
              {(id) => (
                <select
                  id={id}
                  value={group}
                  onChange={(e) => setGroup(e.target.value as CatalogueGroup)}
                >
                  <option value="all">{t('controls.groupAll')}</option>
                  <option value="messier">{t('controls.groupMessier')}</option>
                  <option value="caldwell">{t('controls.groupCaldwell')}</option>
                  <option value="named">{t('controls.groupNamed')}</option>
                </select>
              )}
            </Field>
            <Field label={t('explore.constellation')}>
              {(id) => (
                <select
                  id={id}
                  value={constellation}
                  onChange={(e) => setConstellation(e.target.value)}
                >
                  <option value="">{t('explore.anyConstellation')}</option>
                  {CONSTELLATIONS.map(([abbr, name]) => (
                    <option key={abbr} value={abbr}>
                      {name} ({abbr})
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t('explore.magMax')}>
              {(id) => <NumberInput id={id} value={magMax} onChange={setMagMax} />}
            </Field>
            <Field label={t('explore.sizeMin')}>
              {(id) => <NumberInput id={id} value={sizeMin} onChange={setSizeMin} />}
            </Field>
            <Field label={t('explore.sort')}>
              {(id) => (
                <select
                  id={id}
                  value={sort}
                  onChange={(e) => setSort(e.target.value as CatalogueSort)}
                  disabled={!!q}
                >
                  <option value="relevance">{t('explore.sortRelevance')}</option>
                  <option value="name">{t('explore.sortName')}</option>
                  <option value="magnitude">{t('explore.sortMagnitude')}</option>
                  <option value="size">{t('explore.sortSize')}</option>
                  <option value="ra">{t('explore.sortRa')}</option>
                </select>
              )}
            </Field>
            <div className="stack">
              <Checkbox checked={visibleOnly} onChange={setVisibleOnly}>
                {t('explore.visibleOnly')}
              </Checkbox>
              <Checkbox checked={includeNonDso} onChange={setIncludeNonDso}>
                {t('explore.includeNonDso')}
              </Checkbox>
            </div>
          </div>
        </details>
      </section>
      <section className="card">
        {!app.catalogue.ready ? (
          <Spinner label={t('app.loadingCatalogue')} />
        ) : (
          <>
            <p className="small muted" aria-live="polite">
              {loading ? t('common.loading') : t('explore.results', { count: total })}
            </p>
            {items.length === 0 && !loading ? (
              <EmptyState>{t('explore.noResults')}</EmptyState>
            ) : (
              <VirtualList
                items={items}
                rowHeight={64}
                label={t('explore.title')}
                getKey={(s) => s.id}
                renderRow={(s) => (
                  <Link
                    to={`/target/${encodeURIComponent(s.id)}`}
                    className="list-item"
                    style={{ height: 64 }}
                  >
                    <div className="body">
                      <div
                        className="title"
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {s.name}
                        {s.commonName && <span className="muted"> · {s.commonName}</span>}
                      </div>
                      <div className="sub" style={{ whiteSpace: 'nowrap' }}>
                        {t(`types.${s.type}` as TKey)}
                        {s.constellation && ` · ${s.constellation}`}
                        {s.magV != null && ` · ${fmtNumber(s.magV, 1)} mag`}
                        {s.majorArcmin != null &&
                          ` · ${fmtNumber(s.majorArcmin, s.majorArcmin < 10 ? 1 : 0)}′`}
                        {app.location &&
                          ` · ↑${fmtNumber(culminationAltitudeDeg(s.decDeg, app.location.latDeg), 0)}°`}
                      </div>
                    </div>
                  </Link>
                )}
              />
            )}
            {!q && items.length < total && (
              <button
                type="button"
                className="btn"
                style={{ marginTop: '0.5rem' }}
                onClick={() => void loadMore()}
              >
                {t('controls.showCount', { count: Math.min(PAGE, total - items.length) })}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}
