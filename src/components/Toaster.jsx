import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { cx } from './ui.jsx';
import { Icon } from './Icon.jsx';

/**
 * Minimal toast stack. Anything the user does that would otherwise be silent —
 * adding or removing a session — confirms here, with Undo where it makes sense.
 * A toast with an action stays up longer so there is time to reach it.
 */
const ToastContext = createContext(() => {});

export const useToast = () => useContext(ToastContext);

export function Toaster({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(({ message, icon = 'check', action, duration = action ? 10000 : 4000 }) => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-2), { id, message, icon, action }]);
    setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
        data-testid="toaster"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="glass pointer-events-auto flex animate-rise items-center gap-3 rounded-full border border-hairline py-2 pl-3.5 pr-2 shadow-2xl shadow-black/60"
          >
            <Icon name={t.icon} className="size-4 shrink-0 text-violet-300" />
            <span className="text-[13px] font-medium">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => { t.action.onClick(); dismiss(t.id); }}
                className="rounded-full bg-overlay px-3 py-1 text-[12px] font-semibold text-ink transition-colors hover:bg-raised"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className="grid size-7 shrink-0 place-items-center rounded-full text-faint transition-colors hover:text-ink"
            >
              <Icon name="close" className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
