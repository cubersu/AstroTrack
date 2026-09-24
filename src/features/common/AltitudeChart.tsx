import { useI18n } from '../../i18n/i18n';

export interface AltitudeChartProps {
  times: number[];
  targetAlt?: number[];
  moonAlt?: number[];
  sunAlt?: number[];
  dark?: number[];
  minAltDeg?: number;
  nowMs?: number;
  windowStartMs?: number | null;
  windowEndMs?: number | null;
  height?: number;
}

/** SVG altitude-vs-time chart with darkness shading (no chart library). */
export function AltitudeChart({
  times,
  targetAlt,
  moonAlt,
  sunAlt,
  dark,
  minAltDeg,
  nowMs,
  windowStartMs,
  windowEndMs,
  height = 180,
}: AltitudeChartProps) {
  const { t, fmtTime } = useI18n();
  const W = 600;
  const H = height;
  const padL = 30;
  const padR = 8;
  const padT = 8;
  const padB = 22;
  if (times.length < 2) return null;
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const x = (ms: number) => padL + ((ms - t0) / (t1 - t0)) * (W - padL - padR);
  const y = (alt: number) =>
    padT + ((90 - Math.max(-10, Math.min(90, alt))) / 100) * (H - padT - padB);
  const path = (vals: number[]) =>
    vals
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(times[i]).toFixed(1)},${y(v).toFixed(1)}`)
      .join(' ');
  // Darkness spans.
  const spans: Array<[number, number]> = [];
  if (dark) {
    let s = -1;
    dark.forEach((d, i) => {
      if (d && s < 0) s = i;
      if ((!d || i === dark.length - 1) && s >= 0) {
        spans.push([times[s], times[d ? i : i - 1]]);
        s = -1;
      }
    });
  }
  const hourTicks: number[] = [];
  const firstHour = Math.ceil(t0 / 3600_000) * 3600_000;
  const stepH = (t1 - t0) / 3600_000 > 14 ? 3 : 2;
  for (let ms = firstHour; ms <= t1; ms += 3600_000 * stepH) hourTicks.push(ms);
  return (
    <figure style={{ margin: 0 }}>
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={t('target.chartTitle')}
      >
        {spans.map(([a, b], i) => (
          <rect
            key={i}
            x={x(a)}
            y={padT}
            width={Math.max(0, x(b) - x(a))}
            height={H - padT - padB}
            fill="var(--chart-dark)"
          />
        ))}
        {windowStartMs && windowEndMs && (
          <rect
            x={x(windowStartMs)}
            y={padT}
            width={Math.max(0, x(windowEndMs) - x(windowStartMs))}
            height={H - padT - padB}
            fill="none"
            stroke="var(--chart-target)"
            strokeDasharray="4 3"
            strokeWidth={1}
          />
        )}
        {[0, 30, 60, 90].map((a) => (
          <g key={a}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(a)}
              y2={y(a)}
              stroke="var(--chart-grid)"
              strokeWidth={a === 0 ? 1.2 : 0.6}
            />
            <text x={padL - 4} y={y(a) + 3} textAnchor="end">
              {a}°
            </text>
          </g>
        ))}
        {minAltDeg != null && (
          <line
            x1={padL}
            x2={W - padR}
            y1={y(minAltDeg)}
            y2={y(minAltDeg)}
            stroke="var(--warn)"
            strokeDasharray="3 3"
            strokeWidth={0.8}
          />
        )}
        {hourTicks.map((ms) => (
          <text key={ms} x={x(ms)} y={H - 6} textAnchor="middle">
            {fmtTime(ms)}
          </text>
        ))}
        {sunAlt && (
          <path
            d={path(sunAlt)}
            fill="none"
            stroke="var(--chart-sun)"
            strokeWidth={1}
            opacity={0.7}
          />
        )}
        {moonAlt && (
          <path
            d={path(moonAlt)}
            fill="none"
            stroke="var(--chart-moon)"
            strokeWidth={1.2}
            strokeDasharray="5 3"
          />
        )}
        {targetAlt && (
          <path d={path(targetAlt)} fill="none" stroke="var(--chart-target)" strokeWidth={2.2} />
        )}
        {nowMs && nowMs >= t0 && nowMs <= t1 && (
          <line
            x1={x(nowMs)}
            x2={x(nowMs)}
            y1={padT}
            y2={H - padB}
            stroke="var(--bad)"
            strokeWidth={1.2}
          />
        )}
      </svg>
      <figcaption className="row tiny muted" style={{ gap: '0.8rem', marginTop: 4 }}>
        {targetAlt && (
          <span style={{ color: 'var(--chart-target)' }}>━ {t('target.chartLegendTarget')}</span>
        )}
        {moonAlt && (
          <span style={{ color: 'var(--chart-moon)' }}>╌ {t('target.chartLegendMoon')}</span>
        )}
        {sunAlt && (
          <span style={{ color: 'var(--chart-sun)' }}>━ {t('target.chartLegendSun')}</span>
        )}
        <span>▮ {t('target.chartLegendDark')}</span>
        {minAltDeg != null && (
          <span style={{ color: 'var(--warn)' }}>┄ {t('target.chartLegendMin')}</span>
        )}
      </figcaption>
    </figure>
  );
}
