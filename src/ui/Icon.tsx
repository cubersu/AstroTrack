/** Inline SVG icon set (no external icon font; works offline). */
const PATHS: Record<string, string> = {
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  clock: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zm0-15v5l3.5 2',
  search: 'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm10 2-4.35-4.35',
  sparkle: 'M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z',
  calendar: 'M4 5h16v16H4zM4 9h16M8 3v4M16 3v4',
  target:
    'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zm0-5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-4a1 1 0 1 1 0-2 1 1 0 0 1 0 2z',
  book: 'M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3zM4 17a3 3 0 0 1 3-3h11',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  pin: 'M12 22s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12zm0-9a3 3 0 1 1 0-6 3 3 0 0 1 0 6z',
  download: 'M12 3v12m0 0 5-5m-5 5-5-5M4 19h16',
  gear: 'M12 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.2-1.3L14.3 3h-4l-.4 2.4a7.6 7.6 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z',
  info: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zm0-11v6m0-9.5v.5',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  heart: 'M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z',
  heartFill: 'M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z',
  sun: 'M12 17a5 5 0 1 1 0-10 5 5 0 0 1 0 10zM12 1v2m0 18v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M1 12h2m18 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zm11 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  cloud: 'M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.1 9.6 4.2 4.2 0 0 0 7 18z',
  check: 'M4 12l5 5L20 6',
  x: 'M6 6l12 12M18 6 6 18',
  play: 'M7 4v16l13-8z',
  stop: 'M6 6h12v12H6z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  upload: 'M12 21V9m0 0 5 5m-5-5-5 5M4 5h16',
  compass: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zm4-14-2.5 5.5L8 16l2.5-5.5z',
  layers: 'M12 3 2 8l10 5 10-5zM2 13l10 5 10-5',
  back: 'M15 18l-6-6 6-6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
};

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  title,
  filled,
}: {
  name: IconName;
  title?: string;
  filled?: boolean;
}) {
  const fill = filled || name === 'heartFill' ? 'currentColor' : 'none';
  return (
    <svg
      className="icon-svg"
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}
