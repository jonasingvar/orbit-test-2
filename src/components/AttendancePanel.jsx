import { useEffect, useState } from 'react';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { time as fmtTime } from '../lib/format.js';
import { Button, cx } from './ui.jsx';
import { Icon } from './Icon.jsx';

/**
 * Turning up, and saying what you thought.
 *
 * Check-in opens 15 minutes before a session starts and closes when it ends.
 * Rating is gated on having checked in — otherwise a rating is an opinion
 * about a title, which is how session scores become meaningless.
 */
function Stars({ value, onChange, readOnly }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-1" role={readOnly ? 'img' : 'radiogroup'}
      aria-label={readOnly ? `Rated ${value} out of 5` : 'Your rating'}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          role={readOnly ? undefined : 'radio'}
          aria-checked={!readOnly && value === n}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onMouseEnter={() => !readOnly && setHover(n)}
          onMouseLeave={() => !readOnly && setHover(0)}
          onClick={() => !readOnly && onChange(n)}
          className={cx('transition-transform', !readOnly && 'hover:scale-110')}
        >
          <Icon name="star" filled={n <= shown} className={cx('size-6', n <= shown ? 'text-amber-400' : 'text-overlay')} />
        </button>
      ))}
    </div>
  );
}

export function AttendancePanel({ session }) {
  const { currentUserId, clock, reservationFor } = useConference();
  const { data, reload } = useFetch(
    () => api.getAttendance(currentUserId, session.id, clock),
    [currentUserId, session.id, clock.day, clock.time],
  );
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  // Start the form from the saved rating, so editing moves the stars and a
  // comment can be cleared. Keyed on the saved values, not the payload, so a
  // clock-tick refetch does not overwrite what is being typed.
  const saved = data?.myRating;
  useEffect(() => {
    setStars(saved?.stars ?? 0);
    setComment(saved?.comment ?? '');
  }, [session.id, saved?.stars, saved?.comment]);

  // The clock refetches this every tick; keep showing the last answer meanwhile.
  if (!data) return null;
  const holdsSeat = reservationFor(session.id) === 'confirmed';

  const submit = async (fn) => {
    setBusy(true);
    try { await fn(); reload(); } finally { setBusy(false); }
  };

  // Before the doors open — nothing to do yet.
  if (data.phase === 'future' && !data.checkedIn) {
    if (!holdsSeat) return null;
    return (
      <div className="card p-5 text-[13px] text-muted" data-testid="attendance-panel">
        <p className="flex items-center gap-2">
          <Icon name="clock" className="size-4 text-faint" />
          Check-in opens 15 minutes before the session starts.
        </p>
      </div>
    );
  }

  return (
    <div className="card space-y-4 p-5" data-testid="attendance-panel">
      {data.canCheckIn && (
        <>
          <div>
            <h3 className="text-sm font-semibold">You are at the door</h3>
            <p className="mt-1 text-[12px] text-muted">
              Check in so the seat counts as used. Unclaimed seats are released to the walk-up line.
            </p>
          </div>
          <Button
            variant="primary"
            className="w-full"
            disabled={busy}
            data-testid="check-in"
            onClick={() => submit(() => api.checkIn(currentUserId, session.id, clock))}
          >
            <Icon name="check" className="size-4" />
            {busy ? 'Checking in…' : 'Check in'}
          </Button>
        </>
      )}

      {data.checkedIn && !data.canRate && (
        <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-300" data-testid="checked-in">
          <Icon name="check" className="size-4" />
          Checked in at {fmtTime(data.checkedInAt.slice(11, 16))}
        </p>
      )}

      {data.canRate && (
        <div data-testid="rating-form">
          <h3 className="text-sm font-semibold">
            {data.myRating ? 'Your rating' : 'How was it?'}
          </h3>
          <p className="mt-1 text-[12px] text-muted">
            You were in the room, so your rating counts. You can change it later.
          </p>

          <div className="mt-3">
            <Stars value={stars} onChange={setStars} />
          </div>

          {stars > 0 && (
            <>
              <label className="mt-3 block">
                <span className="sr-only">Anything worth saying</span>
                <textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Anything worth saying? Optional."
                  className="w-full rounded-lg border border-hairline bg-ground/70 px-3 py-2 text-[13px] placeholder:text-faint focus:border-violet-400/60 focus:outline-none"
                />
              </label>
              <Button
                variant="primary"
                size="sm"
                className="mt-2 w-full"
                disabled={busy || !stars}
                data-testid="submit-rating"
                onClick={() => submit(() => api.rateSession(currentUserId, session.id, {
                  stars,
                  comment,
                  ...clock,
                }))}
              >
                {busy ? 'Saving…' : data.myRating ? 'Update rating' : 'Submit rating'}
              </Button>
            </>
          )}
        </div>
      )}

      {data.phase === 'past' && !data.checkedIn && holdsSeat && (
        <p className="text-[13px] text-muted" data-testid="missed">
          You had a seat but never checked in, so you cannot rate this one.
        </p>
      )}
    </div>
  );
}
