import { accentHex } from '../lib/accents.js';

/**
 * Generated cover art.
 *
 * Sessions, tracks and sponsors have no photography, so each one gets a piece
 * of abstract key art derived deterministically from its title. Same title,
 * same artwork, on every machine — no image files, no network.
 *
 * `variant` picks the composition:
 *   'orbit'  concentric arcs, used for keynotes and session heroes
 *   'mesh'   overlapping blobs, used for track and category tiles
 *   'strata' layered bands, used for wide banners
 *   'mark'   tight geometric logo-like mark, used for sponsors
 */
function hash(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const pick = (h, offset, max) => Math.floor((h / 7 ** offset) % max);

export function GeneratedCover({ seed = '', accent = 'violet', variant = 'orbit', className }) {
  const h = hash(seed || variant);
  const [light, dark] = accentHex(accent);
  const id = `c${h % 100000}`;

  const common = (
    <defs>
      <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={light} stopOpacity="0.95" />
        <stop offset="100%" stopColor={dark} stopOpacity="0.95" />
      </linearGradient>
      <radialGradient id={`${id}r`} cx="30%" cy="20%">
        <stop offset="0%" stopColor={light} stopOpacity="0.55" />
        <stop offset="100%" stopColor={dark} stopOpacity="0" />
      </radialGradient>
      <pattern id={`${id}d`} width="14" height="14" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="1.5" r="1.1" fill="#fff" opacity="0.14" />
      </pattern>
    </defs>
  );

  if (variant === 'mark') {
    const rot = pick(h, 1, 4) * 90;
    const style = pick(h, 2, 4);
    return (
      <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
        {common}
        <rect width="48" height="48" rx="12" fill={`url(#${id}g)`} />
        <g transform={`rotate(${rot} 24 24)`} fill="#0b0d14" opacity="0.32">
          {style === 0 && <><circle cx="17" cy="17" r="9" /><circle cx="31" cy="31" r="9" /></>}
          {style === 1 && <><rect x="8" y="8" width="15" height="15" rx="4" /><rect x="25" y="25" width="15" height="15" rx="4" /></>}
          {style === 2 && <path d="M8 40V12a10 10 0 0 1 20 0v16a6 6 0 0 0 12 0" fill="none" stroke="#0b0d14" strokeWidth="6" strokeLinecap="round" />}
          {style === 3 && <><path d="M24 6l16 28H8z" /></>}
        </g>
        <rect width="48" height="48" rx="12" fill={`url(#${id}d)`} opacity="0.5" />
      </svg>
    );
  }

  if (variant === 'mesh') {
    const blobs = [
      { cx: 20 + pick(h, 1, 40), cy: 25 + pick(h, 2, 30), r: 45 + pick(h, 3, 25) },
      { cx: 120 + pick(h, 4, 50), cy: 20 + pick(h, 5, 40), r: 38 + pick(h, 6, 30) },
      { cx: 60 + pick(h, 7, 90), cy: 70 + pick(h, 8, 25), r: 42 + pick(h, 2, 22) },
    ];
    return (
      <svg viewBox="0 0 200 110" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {common}
        <rect width="200" height="110" fill={dark} opacity="0.9" />
        {blobs.map((b, i) => (
          <circle key={i} cx={b.cx} cy={b.cy} r={b.r} fill={i % 2 ? light : dark}
            opacity={0.62 - i * 0.12} style={{ mixBlendMode: 'screen' }} />
        ))}
        <rect width="200" height="110" fill={`url(#${id}d)`} />
      </svg>
    );
  }

  if (variant === 'strata') {
    const bands = Array.from({ length: 4 }, (_, i) => ({
      y: i * 27 + pick(h, i + 1, 10),
      h: 9 + pick(h, i + 2, 14),
      o: 0.12 + pick(h, i + 3, 4) / 18,
    }));
    return (
      <svg viewBox="0 0 320 110" className={className} preserveAspectRatio="none" aria-hidden="true">
        {common}
        <rect width="320" height="110" fill={dark} opacity="0.5" />
        {bands.map((b, i) => (
          <rect key={i} x={-20 + pick(h, i + 4, 60)} y={b.y} width="360" height={b.h}
            rx={b.h / 2} fill={light} opacity={b.o} />
        ))}
        <rect width="320" height="110" fill={`url(#${id}r)`} />
      </svg>
    );
  }

  // 'orbit' — concentric arcs around an off-centre focus
  const cx = 55 + pick(h, 1, 90);
  const cy = 30 + pick(h, 2, 50);
  const rings = 4 + pick(h, 3, 3);
  return (
    <svg viewBox="0 0 200 110" className={className} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {common}
      <rect width="200" height="110" fill={dark} opacity="0.6" />
      <circle cx={cx} cy={cy} r={70} fill={`url(#${id}r)`} />
      {Array.from({ length: rings }, (_, i) => (
        <circle
          key={i}
          cx={cx} cy={cy} r={14 + i * (11 + pick(h, i + 4, 7))}
          fill="none" stroke={light}
          strokeWidth={0.8 + (i % 3) * 0.7}
          opacity={0.5 - i * 0.06}
          strokeDasharray={i % 2 ? `${6 + pick(h, i, 14)} ${4 + pick(h, i + 1, 10)}` : undefined}
        />
      ))}
      <circle cx={cx} cy={cy} r={5 + pick(h, 5, 5)} fill={light} opacity="0.85" />
      <rect width="200" height="110" fill={`url(#${id}d)`} />
    </svg>
  );
}
