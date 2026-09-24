import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Window-scrolling virtualised list for fixed-height rows. Renders only the
 * rows near the viewport, so very large result sets stay responsive.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  renderRow,
  overscan = 8,
  getKey,
  label,
}: {
  items: T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => ReactNode;
  overscan?: number;
  getKey: (item: T, index: number) => string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<[number, number]>([0, 30]);
  useEffect(() => {
    const update = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const vh = window.innerHeight;
      const first = Math.max(0, Math.floor(-top / rowHeight) - overscan);
      const last = Math.min(items.length, Math.ceil((vh - top) / rowHeight) + overscan);
      setRange((r) => (r[0] === first && r[1] === last ? r : [first, last]));
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [items.length, rowHeight, overscan]);
  const [a, b] = range;
  return (
    <div
      ref={ref}
      role="list"
      aria-label={label}
      style={{ position: 'relative', height: items.length * rowHeight }}
    >
      {items.slice(a, Math.max(a, b)).map((item, k) => {
        const i = a + k;
        return (
          <div
            role="listitem"
            key={getKey(item, i)}
            style={{
              position: 'absolute',
              top: i * rowHeight,
              left: 0,
              right: 0,
              height: rowHeight,
            }}
          >
            {renderRow(item, i)}
          </div>
        );
      })}
    </div>
  );
}
