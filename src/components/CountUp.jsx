import { useEffect, useState } from 'react';
import { useInView } from '../lib/useInView.js';

/** Counts from 0 to `value` once the number scrolls into view. */
export function CountUp({ value = 0, duration = 900, className }) {
  const [ref, visible] = useInView({ threshold: 0.5 });
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!visible || !value) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return;
    }
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic, so it decelerates into the final number
      setShown(Math.round(value * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, value, duration]);

  return <span ref={ref} className={className}>{(visible ? shown : 0).toLocaleString()}</span>;
}
