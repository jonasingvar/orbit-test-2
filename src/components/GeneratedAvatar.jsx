/**
 * Deterministic SVG avatars.
 *
 * Every person in the database gets a distinct little portrait derived purely
 * from their name — no network request, no image files, identical on every
 * machine. If a speaker later gets a real photo, set `image_url` on their row
 * and <Avatar> uses that instead.
 */

/** Stable 32-bit hash of a string. Same name always yields the same face. */
function hash(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h << 5) - h + name.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Pull a bounded number out of the hash at a given digit offset. */
const at = (h, offset, max) => Math.floor((h / 10 ** offset) % max);

/** Vivid duotone pairs that all hold up on a near-black background. */
const PALETTES = [
  ['#8B5CF6', '#22D3EE'], ['#F472B6', '#FB923C'], ['#34D399', '#A3E635'],
  ['#38BDF8', '#818CF8'], ['#FBBF24', '#F87171'], ['#2DD4BF', '#60A5FA'],
  ['#C084FC', '#F0ABFC'], ['#4ADE80', '#22D3EE'], ['#FB7185', '#C084FC'],
  ['#FCD34D', '#34D399'], ['#60A5FA', '#A78BFA'], ['#FDBA74', '#FCA5A5'],
];

export function GeneratedAvatar({ name, className }) {
  const h = hash(name);
  const [bg, skin] = PALETTES[h % PALETTES.length];

  // Everything below is jittered by the hash so no two portraits line up.
  const tilt = at(h, 1, 10) - 5;            // -5°…+4°
  const shiftX = at(h, 2, 9) - 4;
  const shiftY = at(h, 3, 7) - 3;
  const eyeSpread = 7 + at(h, 4, 4);        // 7…10
  const eyeY = 18 + at(h, 5, 3);            // 18…20
  const smiling = at(h, 6, 10) > 3;
  const mouthWidth = 5 + at(h, 7, 5);
  const hairStyle = at(h, 8, 4);

  return (
    <svg viewBox="0 0 36 36" className={className} role="presentation" aria-hidden="true">
      <defs>
        <mask id={`m${h}`}>
          <rect width="36" height="36" rx="36" fill="#fff" />
        </mask>
        {/* Hair is clipped to the head so it can never cross the eyes. */}
        <clipPath id={`h${h}`}>
          <circle cx="18" cy="19" r="11" />
        </clipPath>
      </defs>
      <g mask={`url(#m${h})`}>
        <rect width="36" height="36" fill={bg} />
        <g transform={`translate(${shiftX} ${shiftY}) rotate(${tilt} 18 18)`}>
          {/* shoulders */}
          <rect x="3" y="29" width="30" height="18" rx="10" fill={skin} opacity="0.9" />
          {/* head */}
          <circle cx="18" cy="19" r="11" fill={skin} />
          {/* hair — four silhouettes, all confined to the top of the head */}
          <g clipPath={`url(#h${h})`} fill="#0b0b12" opacity="0.28">
            {hairStyle === 0 && <rect x="6" y="6" width="24" height="7" />}
            {hairStyle === 1 && <ellipse cx="18" cy="11" rx="12" ry="6.5" />}
            {hairStyle === 2 && <path d="M6 15C6 6 30 6 30 15V4H6z" />}
            {hairStyle === 3 && <path d="M6 13c2-5 22-5 24 0V4H6z" />}
          </g>
          {/* eyes */}
          <rect x={18 - eyeSpread - 1.2} y={eyeY} width="2.4" height="2.6" rx="1.2" fill="#0b0b12" opacity="0.82" />
          <rect x={18 + eyeSpread - 1.2} y={eyeY} width="2.4" height="2.6" rx="1.2" fill="#0b0b12" opacity="0.82" />
          {/* mouth */}
          {smiling ? (
            <path
              d={`M${18 - mouthWidth} ${eyeY + 6}q${mouthWidth} ${mouthWidth * 0.75} ${mouthWidth * 2} 0`}
              stroke="#0b0b12" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.66"
            />
          ) : (
            <rect x={18 - mouthWidth} y={eyeY + 6} width={mouthWidth * 2} height="1.5" rx="0.75" fill="#0b0b12" opacity="0.55" />
          )}
        </g>
        {/* soft top-left light so the portrait is not flat */}
        <circle cx="10" cy="8" r="16" fill="#fff" opacity="0.06" />
      </g>
    </svg>
  );
}
