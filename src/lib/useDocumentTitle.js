import { useEffect } from 'react';

const SUFFIX = "ORBIT '26";

/**
 * Sets the browser tab title for a route. Every page should call this — the
 * tab, the history entry and a bookmark all read from it.
 * Pass a falsy value while data is loading and the title is left alone.
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title === SUFFIX ? title : `${title} · ${SUFFIX}`;
    return () => { document.title = previous; };
  }, [title]);
}
