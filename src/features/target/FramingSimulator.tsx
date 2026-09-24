/**
 * Offline framing simulator: gnomonic projection of the local star field
 * (offline catalogue), the target's catalogue footprint (ellipse) and the
 * sensor rectangle at the chosen focal length and rotation. North up, east left.
 * This is a schematic star map — never a fabricated image of the object.
 */
import { useEffect, useRef, useState } from 'react';
import { catalogApi } from '../../app/catalogClient';
import { DEG2RAD } from '../../astro/units';
import { useI18n } from '../../i18n/i18n';
import type { StarFieldResponse } from '../../workers/serviceTypes';

export interface SimulatorProps {
  raDeg: number;
  decDeg: number;
  fovWidthDeg: number;
  fovHeightDeg: number;
  rotationDeg: number;
  majorArcmin: number | null;
  minorArcmin: number | null;
  targetPaDeg: number | null;
  targetLabel: string;
  /** Draw the sensor rectangle (false for the plain star-map fallback). */
  showSensor?: boolean;
}

/** Gnomonic projection; returns tangent-plane coordinates in degrees (x east, y north). */
export function gnomonic(
  ra: number,
  dec: number,
  ra0: number,
  dec0: number,
): [number, number] | null {
  const d = dec * DEG2RAD;
  const d0 = dec0 * DEG2RAD;
  const da = (ra - ra0) * DEG2RAD;
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(da);
  if (cosc <= 0.01) return null;
  const x = (Math.cos(d) * Math.sin(da)) / cosc;
  const y = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(da)) / cosc;
  return [x / DEG2RAD, y / DEG2RAD];
}

export function magLimitForField(diagDeg: number): number {
  return Math.max(6, Math.min(12.5, 8 + 3.3 * Math.log10(10 / Math.max(diagDeg, 0.05))));
}

function starColor(bv: number): string {
  if (!Number.isFinite(bv)) return '#ffffff';
  if (bv < 0) return '#aabfff';
  if (bv < 0.3) return '#cad7ff';
  if (bv < 0.6) return '#f8f7ff';
  if (bv < 1.0) return '#fff4ea';
  if (bv < 1.4) return '#ffd2a1';
  return '#ffb46c';
}

export function FramingSimulator(p: SimulatorProps) {
  const { t, fmtNumber } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stars, setStars] = useState<StarFieldResponse | null>(null);
  const [pan, setPan] = useState<[number, number]>([0, 0]);
  const drag = useRef<{ x: number; y: number; pan: [number, number] } | null>(null);
  const diag = Math.hypot(p.fovWidthDeg, p.fovHeightDeg);
  const viewDeg = Math.max(diag * 1.5, ((p.majorArcmin ?? 0) / 60) * 1.4, 0.3);
  const magLimit = magLimitForField(viewDeg);

  useEffect(() => {
    let alive = true;
    catalogApi()
      .starField({
        raDeg: p.raDeg,
        decDeg: p.decDeg,
        radiusDeg: viewDeg * 0.75,
        magLimit,
        maxStars: 6000,
      })
      .then((s) => alive && setStars(s))
      .catch(() => alive && setStars(null));
    return () => {
      alive = false;
    };
  }, [p.raDeg, p.decDeg, viewDeg, magLimit]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const size = cv.clientWidth || 400;
    cv.width = size * dpr;
    cv.height = size * dpr;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#02040a';
    ctx.fillRect(0, 0, size, size);
    const scale = size / viewDeg; // px per degree
    const cx = size / 2 + pan[0];
    const cy = size / 2 + pan[1];
    const toScreen = (x: number, y: number): [number, number] => [cx - x * scale, cy - y * scale];
    // Stars
    if (stars) {
      const brightest = 1;
      for (let i = 0; i < stars.ra.length; i++) {
        const g = gnomonic(stars.ra[i], stars.dec[i], p.raDeg, p.decDeg);
        if (!g) continue;
        const [sx, sy] = toScreen(g[0], g[1]);
        if (sx < -5 || sy < -5 || sx > size + 5 || sy > size + 5) continue;
        const r = Math.max(0.5, 3.4 - 0.36 * (stars.mag[i] - brightest));
        ctx.fillStyle = starColor(stars.bv[i]);
        ctx.globalAlpha = Math.min(1, 0.35 + r / 3);
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = '#8fa3cc';
      for (const l of stars.labels.slice(0, 20)) {
        const g = gnomonic(l.ra, l.dec, p.raDeg, p.decDeg);
        if (!g) continue;
        const [sx, sy] = toScreen(g[0], g[1]);
        if (sx < 0 || sy < 0 || sx > size || sy > size) continue;
        ctx.fillText(l.label, sx + 5, sy - 4);
      }
    }
    // Target footprint (catalogue ellipse)
    if (p.majorArcmin && p.majorArcmin > 0) {
      const a = ((p.majorArcmin / 60) * scale) / 2;
      const b = (((p.minorArcmin ?? p.majorArcmin) / 60) * scale) / 2;
      const pa = (p.targetPaDeg ?? 0) * DEG2RAD;
      ctx.save();
      ctx.translate(cx, cy);
      // Screen rotation: PA measured N→E; north up, east left ⇒ rotate by −PA.
      ctx.rotate(-pa);
      ctx.strokeStyle = '#f2b94b';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(b, 2), Math.max(a, 2), 0, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.strokeStyle = '#f2b94b';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, 2 * Math.PI);
      ctx.stroke();
    }
    // Sensor rectangle (long side along PA = rotationDeg)
    if (p.showSensor === false) {
      drawCompass();
      return;
    }
    const w = p.fovWidthDeg * scale;
    const h = p.fovHeightDeg * scale;
    const long = Math.max(w, h);
    const short = Math.min(w, h);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-p.rotationDeg * DEG2RAD);
    ctx.strokeStyle = '#7aa2ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    // Long side along the local "north" axis before rotation (PA 0 = portrait).
    ctx.strokeRect(-short / 2, -long / 2, short, long);
    ctx.restore();
    drawCompass();
    function drawCompass() {
      ctx!.fillStyle = '#9aa6c4';
      ctx!.font = '12px system-ui, sans-serif';
      ctx!.fillText('N ↑', 8, 16);
      ctx!.fillText('← E', 8, 32);
      ctx!.fillStyle = '#f2b94b';
      ctx!.fillText(p.targetLabel, cx + 8, cy + 14);
    }
  }, [stars, p, viewDeg, pan]);

  return (
    <figure style={{ margin: 0 }}>
      <canvas
        ref={canvasRef}
        className="skymap"
        role="img"
        aria-label={`${t('framing.simulator')}: ${p.targetLabel}`}
        onPointerDown={(e) => {
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, pan };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPan([
            drag.current.pan[0] + e.clientX - drag.current.x,
            drag.current.pan[1] + e.clientY - drag.current.y,
          ]);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      />
      <figcaption className="tiny muted" style={{ marginTop: 4 }}>
        {stars &&
          t('framing.starsSource', {
            sources: stars.sources.join(', ') || '—',
            mag: fmtNumber(magLimit, 1),
          })}{' '}
        · {t('framing.footprintNote')}
        {magLimit > 8 && stars && !stars.sources.some((s) => s !== 'stars-core') && (
          <> · {t('framing.showDeepStars')}</>
        )}
        {(pan[0] !== 0 || pan[1] !== 0) && (
          <>
            {' '}
            <button type="button" className="btn small ghost" onClick={() => setPan([0, 0])}>
              {t('framing.resetView')}
            </button>
          </>
        )}
      </figcaption>
    </figure>
  );
}
