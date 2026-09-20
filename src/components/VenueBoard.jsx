import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { accent } from '../lib/accents.js';
import { time as fmtTime } from '../lib/format.js';
import { toMinutes, relativeToNow } from '../lib/clock.js';
import { Chip, Skeleton, cx } from './ui.jsx';
import { Icon } from './Icon.jsx';
import { LiveBadge } from './LiveNow.jsx';

/**
 * A live board of every room at one venue: what is on now, what is next, and
 * how full it is. Replaces a scatter plot of invented map coordinates that
 * looked like geography but was not, and a set of static room lists.
 */
export function VenueBoard({ venue, day }) {
  const { clock, rooms, seatsFor, reservationFor } = useConference();
  const { data, loading } = useFetch(
    () => api.getSessions({ day, venueId: venue.id }),
    [day, venue.id],
  );

  const nowMins = toMinutes(clock.time);
  const isToday = clock.day === day;

  const board = useMemo(() => {
    const venueRooms = rooms.filter((r) => r.venueId === venue.id);
    const byRoom = new Map(venueRooms.map((r) => [r.id, { room: r, sessions: [] }]));
    for (const s of data ?? []) {
      if (byRoom.has(s.room.id)) byRoom.get(s.room.id).sessions.push(s);
    }

    return [...byRoom.values()]
      .map((entry) => {
        const sorted = [...entry.sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        const current = isToday
          ? sorted.find((s) => nowMins >= toMinutes(s.startsAt) && nowMins < toMinutes(s.endsAt))
          : null;
        const next = sorted.find((s) => toMinutes(s.startsAt) > (isToday ? nowMins : -1));
        return { ...entry, sorted, current, next };
      })
      // rooms actually in use first, biggest first
      .sort((a, b) =>
        Number(Boolean(b.current)) - Number(Boolean(a.current))
        || b.sorted.length - a.sorted.length
        || b.room.capacity - a.room.capacity);
  }, [data, rooms, venue.id, nowMins, isToday]);

  if (loading) {
    return <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>;
  }

  const inUse = board.filter((b) => b.sorted.length > 0);
  const idle = board.filter((b) => b.sorted.length === 0);

  return (
    <div className="space-y-4" data-testid={`venue-board-${venue.id}`}>
      <div className="grid gap-3 lg:grid-cols-2">
        {inUse.map(({ room, current, next, sorted }) => {
          const shown = current ?? next;
          const a = shown ? accent(shown.track.color) : accent('violet');
          const live = seatsFor(shown?.id);
          const seatsLeft = live?.seatsLeft ?? shown?.seatsLeft ?? 0;
          const waitlistCount = live?.waitlistCount ?? shown?.waitlistCount ?? 0;
          const isFull = shown ? seatsLeft === 0 : false;
          const mine = shown ? reservationFor(shown.id) : null;

          return (
            <div
              key={room.id}
              className={cx(
                'group relative overflow-hidden rounded-xl border bg-raised p-4 transition-colors',
                current ? 'border-rose-400/40' : 'border-hairline',
              )}
            >
              <span className={cx('absolute inset-y-0 left-0 w-1 bg-gradient-to-b', a.grad)} />

              <div className="flex items-start justify-between gap-3 pl-2">
                <div className="min-w-0">
                  <h4 className="truncate text-sm font-bold">{room.name}</h4>
                  <p className="truncate text-[11px] text-faint">
                    {room.building} · {room.floor} · {room.capacity.toLocaleString()} seats · ~{room.walkMinutes} min walk
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {!room.accessible && (
                    <Chip accent="amber" className="!py-0.5 !text-[9px]">Stairs</Chip>
                  )}
                  {current && <LiveBadge />}
                </div>
              </div>

              {shown ? (
                <Link to={`/sessions/${shown.id}`} className="mt-3 block pl-2">
                  <div className="flex items-baseline gap-2 font-mono text-[11px]">
                    <span className={cx(current ? 'text-rose-300' : 'text-cyan-300')}>
                      {current ? `ends ${relativeToNow(shown.endsAt, clock.time)}` : `${fmtTime(shown.startsAt)}`}
                    </span>
                    {!current && isToday && (
                      <span className="text-faint">{relativeToNow(shown.startsAt, clock.time)}</span>
                    )}
                    <span className={cx('ml-auto', a.text)}>{shown.track.name}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] font-semibold leading-snug transition-colors group-hover:text-violet-200">
                    {shown.title}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-[11px]">
                    {isFull
                      ? <span className="font-bold text-rose-300">Full{waitlistCount > 0 && ` · ${waitlistCount} waiting`}</span>
                      : <span className={cx('font-semibold', seatsLeft <= 10 ? 'text-amber-300' : 'text-muted')}>
                          {seatsLeft.toLocaleString()} seats left
                        </span>}
                    {mine && (
                      <Chip accent={mine === 'waitlisted' ? 'amber' : 'emerald'} className="!py-0.5 !text-[9px]">
                        {mine === 'waitlisted' ? 'Waitlisted' : 'On my agenda'}
                      </Chip>
                    )}
                    <span className="ml-auto text-faint">{sorted.length} {isToday ? 'today' : 'this day'}</span>
                  </div>
                </Link>
              ) : (
                <p className="mt-3 pl-2 text-[12px] text-faint">{isToday ? 'Nothing left here today.' : 'Nothing on here this day.'}</p>
              )}
            </div>
          );
        })}
      </div>

      {idle.length > 0 && (
        <p className="text-[11px] text-faint">
          <Icon name="info" className="mr-1 inline size-3" />
          {idle.length} more {idle.length === 1 ? 'stage is' : 'stages are'} dark {isToday ? 'today' : 'this day'}: {idle.map((b) => b.room.name).join(', ')}.
        </p>
      )}
    </div>
  );
}
