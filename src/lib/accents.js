/**
 * The database stores accent colours as bare names ("violet", "cyan", …).
 * Tailwind cannot build class names at runtime, so every accent maps to a
 * fixed set of full class strings here. Add a colour → add a row.
 */
export const ACCENTS = {
  violet:  { chip: 'bg-violet-500/12 text-violet-300 border-violet-500/25',   dot: 'bg-violet-400',  ring: 'ring-violet-500/30',  grad: 'from-violet-500 to-violet-700',  text: 'text-violet-300',  glow: 'shadow-violet-500/20' },
  cyan:    { chip: 'bg-cyan-500/12 text-cyan-300 border-cyan-500/25',         dot: 'bg-cyan-400',    ring: 'ring-cyan-500/30',    grad: 'from-cyan-500 to-cyan-700',      text: 'text-cyan-300',    glow: 'shadow-cyan-500/20' },
  emerald: { chip: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/25', dot: 'bg-emerald-400', ring: 'ring-emerald-500/30', grad: 'from-emerald-500 to-emerald-700', text: 'text-emerald-300', glow: 'shadow-emerald-500/20' },
  amber:   { chip: 'bg-amber-500/12 text-amber-300 border-amber-500/25',      dot: 'bg-amber-400',   ring: 'ring-amber-500/30',   grad: 'from-amber-500 to-amber-700',    text: 'text-amber-300',   glow: 'shadow-amber-500/20' },
  orange:  { chip: 'bg-orange-500/12 text-orange-300 border-orange-500/25',   dot: 'bg-orange-400',  ring: 'ring-orange-500/30',  grad: 'from-orange-500 to-orange-700',  text: 'text-orange-300',  glow: 'shadow-orange-500/20' },
  rose:    { chip: 'bg-rose-500/12 text-rose-300 border-rose-500/25',         dot: 'bg-rose-400',    ring: 'ring-rose-500/30',    grad: 'from-rose-500 to-rose-700',      text: 'text-rose-300',    glow: 'shadow-rose-500/20' },
  fuchsia: { chip: 'bg-fuchsia-500/12 text-fuchsia-300 border-fuchsia-500/25', dot: 'bg-fuchsia-400', ring: 'ring-fuchsia-500/30', grad: 'from-fuchsia-500 to-fuchsia-700', text: 'text-fuchsia-300', glow: 'shadow-fuchsia-500/20' },
  sky:     { chip: 'bg-sky-500/12 text-sky-300 border-sky-500/25',            dot: 'bg-sky-400',     ring: 'ring-sky-500/30',     grad: 'from-sky-500 to-sky-700',        text: 'text-sky-300',     glow: 'shadow-sky-500/20' },
  lime:    { chip: 'bg-lime-500/12 text-lime-300 border-lime-500/25',         dot: 'bg-lime-400',    ring: 'ring-lime-500/30',    grad: 'from-lime-500 to-lime-700',      text: 'text-lime-300',    glow: 'shadow-lime-500/20' },
  teal:    { chip: 'bg-teal-500/12 text-teal-300 border-teal-500/25',         dot: 'bg-teal-400',    ring: 'ring-teal-500/30',    grad: 'from-teal-500 to-teal-700',      text: 'text-teal-300',    glow: 'shadow-teal-500/20' },
};

export const accent = (name) => ACCENTS[name] ?? ACCENTS.violet;

/**
 * Real hex values for the same accents, used by generated SVG artwork where
 * Tailwind classes are not available (gradients, fills, canvas-style drawing).
 */
export const ACCENT_HEX = {
  violet:  ['#a78bfa', '#6d28d9'],
  cyan:    ['#67e8f9', '#0e7490'],
  emerald: ['#6ee7b7', '#047857'],
  amber:   ['#fcd34d', '#b45309'],
  orange:  ['#fdba74', '#c2410c'],
  rose:    ['#fda4af', '#be123c'],
  fuchsia: ['#f0abfc', '#a21caf'],
  sky:     ['#7dd3fc', '#0369a1'],
  lime:    ['#bef264', '#4d7c0f'],
  teal:    ['#5eead4', '#0f766e'],
};

export const accentHex = (name) => ACCENT_HEX[name] ?? ACCENT_HEX.violet;

/** Stable accent for an arbitrary label (cuisine, tier, category …). */
export function accentFor(label = '') {
  const names = Object.keys(ACCENT_HEX);
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return names[h % names.length];
}
