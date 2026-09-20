import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { timeRange } from '../lib/format.js';
import { Button, cx } from './ui.jsx';
import { Icon } from './Icon.jsx';

/**
 * You already hold a seat at this time.
 *
 * This is a choice between two sessions, not an error — so it gets a dialog
 * that shows both of them, not a toast that names one and disappears.
 */
function SessionChoice({ session, tone, label }) {
  return (
    <div className={cx(
      'rounded-xl border p-4',
      tone === 'keep' ? 'border-emerald-400/35 bg-emerald-500/[0.07]' : 'border-violet-400/35 bg-violet-500/[0.07]',
    )}>
      <p className={cx('text-[10px] font-bold uppercase tracking-[0.14em]',
        tone === 'keep' ? 'text-emerald-300' : 'text-violet-300')}>
        {label}
      </p>
      <Link to={`/sessions/${session.id}`} className="mt-1.5 block text-sm font-semibold leading-snug hover:text-violet-200">
        {session.title}
      </Link>
      <p className="mt-1.5 font-mono text-[11px] text-muted">
        {timeRange(session.startsAt, session.endsAt)}
      </p>
      <p className="text-[11px] text-faint">
        {session.roomName}{session.venueName && ` · ${session.venueName}`}
      </p>
    </div>
  );
}

export function ConflictDialog({ conflict, onSwap, onCancel, busy }) {
  const ref = useRef(null);
  // Layout passes fresh handlers on every render; read them through a ref so
  // the effects below only run when the conflict itself changes.
  const cancelRef = useRef(onCancel);
  cancelRef.current = busy ? () => {} : onCancel;

  // Move focus in when the dialog opens, and give it back when it closes.
  useEffect(() => {
    if (!conflict) return;
    const opener = document.activeElement;
    ref.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') cancelRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [conflict]);

  if (!conflict) return null;
  const { wanted, conflictsWith } = conflict;

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-end sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-title"
      data-testid="conflict-dialog"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        disabled={busy}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />

      <div
        ref={ref}
        tabIndex={-1}
        className="glass relative w-full max-w-lg animate-rise rounded-t-2xl border border-hairline p-6 shadow-2xl shadow-black/70 focus:outline-none sm:rounded-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-300">
            <Icon name="alert" className="size-5" />
          </span>
          <div>
            <h2 id="conflict-title" className="font-display text-xl leading-tight">
              You are already booked at this time
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              A seat is a real chair, so you can only hold one per slot. Keep what you have, or swap.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <SessionChoice session={conflictsWith} tone="keep" label="You have a seat for" />
          <SessionChoice session={wanted} tone="want" label="You wanted" />
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={busy} data-testid="conflict-keep">
            Keep {conflictsWith.title.length > 22 ? 'what I have' : `“${conflictsWith.title}”`}
          </Button>
          <Button variant="primary" onClick={onSwap} disabled={busy} data-testid="conflict-swap">
            <Icon name="route" className="size-4" />
            {busy ? 'Swapping…' : 'Swap to this one'}
          </Button>
        </div>
      </div>
    </div>
  );
}
