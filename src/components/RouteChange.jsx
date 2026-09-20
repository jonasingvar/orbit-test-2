import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * React Router keeps the scroll position across navigations, so without this
 * you click "Schedule" from halfway down the speakers page and land in the
 * middle of the schedule. Resets scroll and moves focus to the main landmark,
 * which is also what a screen reader needs on a route change.
 */
export function RouteChange({ mainId = 'main' }) {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const main = document.getElementById(mainId);
    if (main) {
      main.setAttribute('tabindex', '-1');
      main.focus({ preventScroll: true });
      main.removeAttribute('tabindex');
    }
    // Only the pathname resets scroll — search is left out so filter changes
    // do not yank the page around
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
