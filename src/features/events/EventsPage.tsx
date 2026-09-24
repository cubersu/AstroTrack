import { useEffect, useRef, useState } from 'react';
import type { PlanetVisibility, SkyEvent } from '../../astro/events';
import { parseMpcCometFile } from '../../astro/comets';
import { computeNight } from '../../astro/twilight';
import { useApp } from '../../app/AppState';
import { catalogApi } from '../../app/catalogClient';
import { dataDb } from '../../data/dataDb';
import { useI18n } from '../../i18n/i18n';
import type { TKey } from '../../i18n/i18n';
import { EmptyState, Segmented, Spinner } from '../../ui/controls';
import { useLiveQuery } from '../../ui/hooks';
import { useToast } from '../../ui/toast';
import type { CometView } from '../../workers/eventsService';
import { geo, usePlanningDate } from '../common/nightHooks';
import { SetupPrompt } from '../common/SetupPrompt';
import { bodyName, eventDetails, eventTitle } from './eventText';

const MPC_COMET_URL = 'https://www.minorplanetcenter.net/iau/MPCORB/CometEls.txt';

export function EventsPage() {
  const i18n = useI18n();
  const { t, fmtDateTime, fmtTime, fmtNumber, fmtDate } = i18n;
  const app = useApp();
  const toast = useToast();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [date] = usePlanningDate(app.location);
  const [events, setEvents] = useState<SkyEvent[] | null>(null);
  const [planets, setPlanets] = useState<PlanetVisibility[] | null>(null);
  const [comets, setComets] = useState<CometView[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cometMeta = useLiveQuery(() => dataDb().cometData.get('comets'), [], undefined);

  useEffect(() => {
    if (!app.location || !date) return;
    let alive = true;
    const g = geo(app.location);
    const n = computeNight(date, g);
    setEvents(null);
    const start = n.spanStartMs - 12 * 3600_000;
    const end = start + Number(days) * 86400_000;
    void catalogApi()
      .events(start, end, g)
      .then((e) => alive && setEvents(e));
    void catalogApi()
      .planets(n.spanStartMs - 3600_000, n.spanEndMs + 3600_000, g)
      .then((p) => alive && setPlanets(p));
    void catalogApi()
      .cometsTonight(n.spanStartMs, n.spanEndMs, g, 12)
      .then((c) => alive && setComets(c));
    return () => {
      alive = false;
    };
  }, [app.location, date, days, cometMeta?.fetchedAt]);

  async function storeComets(text: string, source: string) {
    const { comets: parsed } = parseMpcCometFile(text);
    if (parsed.length === 0) throw new Error('no valid comet lines');
    await dataDb().cometData.put({
      id: 'comets',
      fetchedAt: Date.now(),
      source,
      text,
      count: parsed.length,
    });
    toast(t('events.cometsImported', { count: parsed.length }));
  }

  return (
    <div>
      <div className="page-header">
        <h1>{t('events.title')}</h1>
        <p>{t('events.subtitle')}</p>
      </div>
      <SetupPrompt />
      <section className="card">
        <div className="row between">
          <Segmented
            label={t('events.range')}
            value={days}
            onChange={setDays}
            options={(['7', '30', '90'] as const).map((d) => ({
              value: d,
              label: t('events.days', { count: d }),
            }))}
          />
          <span className="tiny faint">{t('events.notScored')}</span>
        </div>
      </section>

      <section className="card">
        <h2>{t('events.planetsTonight')}</h2>
        {!planets ? (
          <Spinner label={t('events.loading')} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">{t('events.body')}</th>
                  <th scope="col">{t('events.mag')}</th>
                  <th scope="col">{t('events.diameter')}</th>
                  <th scope="col">{t('events.elong')}</th>
                  <th scope="col">{t('events.visibleWindow')}</th>
                  <th scope="col">{t('events.rise')}</th>
                  <th scope="col">{t('events.transit')}</th>
                  <th scope="col">{t('events.set')}</th>
                </tr>
              </thead>
              <tbody>
                {planets.map((p) => (
                  <tr key={p.body}>
                    <th scope="row">{bodyName(i18n, p.body)}</th>
                    <td>{fmtNumber(p.magnitude, 1)}</td>
                    <td>{fmtNumber(p.diameterArcsec, 1)}″</td>
                    <td>{fmtNumber(p.elongationDeg, 0)}°</td>
                    <td>
                      {p.visibleFromMs && p.visibleToMs ? (
                        <>
                          {fmtTime(p.visibleFromMs)}–{fmtTime(p.visibleToMs)} (
                          {fmtNumber(p.maxAltDeg, 0)}°)
                        </>
                      ) : (
                        <span className="faint">{t('events.notVisible')}</span>
                      )}
                    </td>
                    <td>{p.riseMs ? fmtTime(p.riseMs) : '—'}</td>
                    <td>{p.transitMs ? fmtTime(p.transitMs) : '—'}</td>
                    <td>{p.setMs ? fmtTime(p.setMs) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>{t('events.upcoming')}</h2>
        {!events ? (
          <Spinner label={t('events.loading')} />
        ) : events.length === 0 ? (
          <EmptyState>{t('events.none')}</EmptyState>
        ) : (
          <ul className="list">
            {events.map((e) => (
              <li key={e.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                <div className="body">
                  <div className="title">
                    {e.highlight && <span className="badge info">★</span>} {eventTitle(i18n, e)}
                  </div>
                  <div className="sub">
                    {fmtDateTime(e.timeMs)}
                    {e.visibleHere !== null && (
                      <>
                        {' · '}
                        <span style={{ color: e.visibleHere ? 'var(--good)' : 'var(--fg-faint)' }}>
                          {e.visibleHere ? t('events.visibleHere') : t('events.notVisibleHere')}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="tiny muted">{eventDetails(i18n, e).join(' · ')}</div>
                  <div className="tiny faint">{t(`events.tip.${e.kind}` as TKey)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>{t('events.comets')}</h2>
        {cometMeta ? (
          <p className="small muted">
            {t('events.cometsUpdated', {
              source: cometMeta.source,
              date: fmtDate(cometMeta.fetchedAt),
              count: cometMeta.count,
            })}
          </p>
        ) : (
          <p className="small muted">{t('events.cometsNone')}</p>
        )}
        <div className="row">
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            {t('events.cometsImport')}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                await storeComets(await f.text(), f.name);
              } catch (err) {
                toast(t('common.error', { error: (err as Error).message }));
              }
            }}
          />
          <button
            type="button"
            className="btn"
            disabled={fetching}
            onClick={async () => {
              setFetching(true);
              try {
                const res = await fetch(MPC_COMET_URL, { cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                await storeComets(await res.text(), 'Minor Planet Center');
              } catch (err) {
                toast(t('events.cometsFetchFailed', { error: (err as Error).message }));
              } finally {
                setFetching(false);
              }
            }}
          >
            {fetching ? t('common.loading') : t('events.cometsFetch')}
          </button>
          {cometMeta && (
            <button
              type="button"
              className="btn danger"
              onClick={() => void dataDb().cometData.delete('comets')}
            >
              {t('events.clearComets')}
            </button>
          )}
        </div>
        {comets && comets.length > 0 && (
          <>
            <h3 style={{ marginTop: '0.75rem' }}>{t('events.cometsBright', { mag: 12 })}</h3>
            <ul className="list">
              {comets.map((c) => (
                <li key={c.designation} className="list-item">
                  <div className="body">
                    <div className="title">{c.designation}</div>
                    <div className="sub">
                      {t('events.mag')} ≈ {c.magnitude !== null ? fmtNumber(c.magnitude, 1) : '—'} ·{' '}
                      {t('events.cometDistance', {
                        r: fmtNumber(c.rAu, 2),
                        delta: fmtNumber(c.deltaAu, 2),
                      })}{' '}
                      · {t('events.elong')} {fmtNumber(c.elongationDeg, 0)}°
                    </div>
                    <div className="tiny">
                      {c.visibleFromMs && c.visibleToMs
                        ? `${fmtTime(c.visibleFromMs)}–${fmtTime(c.visibleToMs)} (${t('tonight.maxAlt', { alt: fmtNumber(c.maxAltDeg, 0) })})`
                        : t('events.notVisible')}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <p className="tiny faint">{t('events.cometsMagNote')}</p>
          </>
        )}
      </section>
    </div>
  );
}
