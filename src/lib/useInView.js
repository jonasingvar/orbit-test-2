import { useEffect, useRef, useState } from 'react';

/**
 * Reveal-on-scroll. Attach the returned ref to an element carrying the
 * `reveal` utility class; it flips `data-visible` once when the element
 * first enters the viewport.
 *
 *   const [ref, visible] = useInView();
 *   <section ref={ref} data-visible={visible} className="reveal">…
 */
export function useInView({ threshold = 0.12, rootMargin = '0px 0px -8% 0px' } = {}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;

    // Without IntersectionObserver, just show everything.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        io.disconnect();
      }
    }, { threshold, rootMargin });

    io.observe(el);
    return () => io.disconnect();
  }, [threshold, rootMargin, visible]);

  return [ref, visible];
}
