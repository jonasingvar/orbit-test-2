import { useEffect, useState } from 'react';
import { cx } from './ui.jsx';

/**
 * Hero photography.
 *
 * Drop JPGs into `public/images/` named hero-1.jpg … hero-6.jpg and they are
 * picked up automatically — the component probes each one and quietly ignores
 * any that are not there, so the hero works with zero images, one, or six.
 * With more than one it cross-fades between them on a slow ken-burns drift.
 *
 * Nothing here is required: with no images the hero falls back to the gradient
 * and grid treatment underneath.
 */
const CANDIDATES = [1, 2, 3, 4, 5, 6].map((n) => `/images/hero-${n}.jpg`);
const ROTATE_MS = 9000;

export function HeroMedia({ className }) {
  const [available, setAvailable] = useState([]);
  const [index, setIndex] = useState(0);

  // Probe once on mount; only images that actually decode make the list.
  useEffect(() => {
    let cancelled = false;
    Promise.all(CANDIDATES.map((src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(src);
      img.onerror = () => resolve(null);
      img.src = src;
    }))).then((results) => {
      if (!cancelled) setAvailable(results.filter(Boolean));
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (available.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % available.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [available.length]);

  if (!available.length) return null;

  return (
    <div className={cx('absolute inset-0 overflow-hidden', className)} aria-hidden="true" data-testid="hero-media">
      {available.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          className={cx(
            'absolute inset-0 size-full object-cover transition-opacity duration-[1600ms] ease-in-out',
            i === index ? 'animate-ken-burns opacity-100' : 'opacity-0',
          )}
        />
      ))}
      {/* Keep the copy readable whatever the photograph is doing. */}
      <div className="absolute inset-0 bg-gradient-to-r from-ground via-ground/85 to-ground/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-ground via-ground/25 to-ground/70" />
    </div>
  );
}
