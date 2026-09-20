import { useState } from 'react';
import { useConference } from '../lib/store.jsx';
import { plural } from '../lib/format.js';
import { Button, cx } from './ui.jsx';
import { Icon } from './Icon.jsx';

/**
 * Seat reservation for one session.
 *
 * Adding a session to your agenda is the only action, and it is a commitment
 * against a finite number of chairs: it moves the seat count for everyone, and
 * when the room is full it puts you on a waitlist instead.
 */
export function SeatPanel({ session }) {
  const { reservationFor, seatsFor, reserveSeat, releaseSeat } = useConference();
  const [busy, setBusy] = useState(false);

  // Live counts win over whatever the page was rendered with.
  const live = seatsFor(session.id);
  const capacity = live?.capacity ?? session.seats?.capacity ?? session.capacity;
  const seatsTaken = live?.seatsTaken ?? session.seats?.seatsTaken ?? session.seatsTaken;
  const seatsLeft = Math.max(0, capacity - seatsTaken);
  const waitlistCount = live?.waitlistCount ?? session.seats?.waitlistCount ?? 0;
  // The store is the single source of truth for *my* reservation. Falling back
  // to the payload the page was fetched with would make "released" unreachable,
  // because that payload still says 'confirmed' until the next refetch.
  const status = reservationFor(session.id);
  // The live value wins: after joining a queue the page payload is stale.
  const waitlistPosition = live?.waitlistPosition ?? session.seats?.waitlistPosition ?? null;
  const ahead = waitlistPosition ? waitlistPosition - 1 : null;

  const pct = capacity ? Math.min(100, Math.round((seatsTaken / capacity) * 100)) : 0;
  const isFull = seatsLeft === 0;
  const tone = pct >= 100 ? 'bg-rose-400' : pct >= 85 ? 'bg-amber-400' : 'bg-emerald-400';

  const act = async (fn) => {
    setBusy(true);
    try { await fn(session.id); } finally { setBusy(false); }
  };

  return (
    <div className="card space-y-4 p-5" data-testid="seat-panel">
      <div>
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-muted">Seats</span>
          <span className="font-mono text-ink" data-testid="seat-count">
            {seatsTaken.toLocaleString()} / {capacity.toLocaleString()}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-overlay">
          <div className={cx('h-full rounded-full transition-all duration-500', tone)} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] text-faint" data-testid="seats-left">
          {isFull
            ? `Full · ${plural(waitlistCount, 'person', 'people')} waiting`
            : `${seatsLeft.toLocaleString()} seats left`}
        </p>
      </div>

      {status === 'confirmed' && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] p-3" data-testid="reservation-confirmed">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-200">
            <Icon name="ticket" className="size-4" />
            Your seat is reserved
          </p>
          <p className="mt-1 text-[12px] text-muted">
            Seats are released 5 minutes before the session starts if you have not arrived.
          </p>
        </div>
      )}

      {status === 'waitlisted' && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-3" data-testid="reservation-waitlisted">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-200">
            <Icon name="clock" className="size-4" />
            You are on the waitlist
          </p>
          <p className="mt-1 text-[12px] text-muted">
            {ahead === null
              ? 'We will pass you the next seat someone releases.'
              : ahead === 0
                ? 'You are next in line — the next seat released is yours.'
                : `${plural(ahead, 'person', 'people')} ahead of you. We will pass you a seat as they are released.`}
          </p>
          {waitlistPosition && (
            <p className="mt-2 font-mono text-[11px] text-amber-200/80">
              Position {waitlistPosition} of {waitlistCount}
            </p>
          )}
        </div>
      )}

      {status ? (
        <Button variant="ghost" className="w-full" disabled={busy}
          onClick={() => act(releaseSeat)} data-testid="release-seat">
          {busy ? 'Working…' : status === 'waitlisted' ? 'Leave the waitlist' : 'Release my seat'}
        </Button>
      ) : (
        <Button variant="primary" className="w-full" disabled={busy}
          onClick={() => act(reserveSeat)} data-testid="reserve-seat">
          <Icon name={isFull ? 'clock' : 'ticket'} className="size-4" />
          {busy ? 'Working…' : isFull ? 'Join the waitlist' : 'Reserve a seat'}
        </Button>
      )}

      {session.requiresRsvp && !status && (
        <p className="text-[11px] text-amber-300">
          This one needs a reservation — hands-on rooms are not open to walk-ups.
        </p>
      )}
    </div>
  );
}
