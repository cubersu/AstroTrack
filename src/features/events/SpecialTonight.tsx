import { useEffect, useState } from 'react';
import type { SkyEvent } from '../../astro/events';
import type { CalendarDate } from '../../astro/time';
import { computeNight } from '../../astro/twilight';
import { catalogApi } from '../../app/catalogClient';
import { Link } from '../../app/router';
import type { ObservingLocation } from '../../db/types';
import { useI18n } from '../../i18n/i18n';
import { Icon } from '../../ui/Icon';
import { geo } from '../common/nightHooks';
import { eventTitle } from './eventText';

/** Informational highlights for the selected night — never scored against DSOs. */
export function SpecialTonight({
  location,
  date,
}: {
  location: ObservingLocation;
  date: CalendarDate;
}) {
  const i18n = useI18n();
  const { t, fmtTime } = i18n;
  const [events, setEvents] = useState<SkyEvent[] | null>(null);
  useEffect(() => {
    let alive = true;
    const g = geo(location);
    const n = computeNight(date, g);
    const start = n.spanStartMs - 2 * 3600_000;
    const end = n.spanEndMs + 2 * 3600_000;
    catalogApi()
      .events(start - 24 * 3600_000, end + 24 * 3600_000, g)
      .then((all) => {
        if (!alive) return;
        setEvents(
          all.filter((e) => {
            if (e.kind === 'meteor-shower')
              return Math.abs(e.timeMs - (start + end) / 2) < 1.5 * 86400_000;
            if (e.kind === 'moon-phase') return false;
            return e.timeMs >= start && e.timeMs <= end && e.visibleHere !== false;
          }),
        );
      })
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, [location, date]);
  if (!events || events.length === 0) return null;
  return (
    <section
      className="card"
      aria-label={t('tonight.special')}
      style={{ borderColor: 'var(--accent)' }}
    >
      <h2 className="row">
        <Icon name="sparkle" /> {t('tonight.special')}
      </h2>
      <ul className="list">
        {events.map((e) => (
          <li key={e.id} className="row between small" style={{ padding: '0.3rem 0' }}>
            <span>
              {e.highlight && <span className="badge info">★</span>} {eventTitle(i18n, e)}
            </span>
            <span className="muted">{fmtTime(e.timeMs)}</span>
          </li>
        ))}
      </ul>
      <p className="tiny faint">
        {t('events.notScored')} <Link to="/events">{t('nav.events')} →</Link>
      </p>
    </section>
  );
}
