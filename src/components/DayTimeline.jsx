import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { buildTimeline } from '../lib/timeline.js';
import { accent } from '../lib/accents.js';
import { dayLabel, duration, time as fmtTime, timeRange } from '../lib/format.js';
import { Icon } from './Icon.jsx';
import { cx } from './ui.jsx';

/**
 * The shape of one booked day, as a strip.
 *
 * A list of four sessions tells you what you are going to; it does not tell you
 * whether the hole after lunch is a coffee or a drive across town. Blocks are
 * proportional to duration and gaps are drawn at the same scale, so the day
 * reads as time rather than as rows.
 *
 * Nothing here is carried by hue alone: a travel gap is hatched, carries the
 * car icon, and says "Enough time", "Tight" or "Not enough time" in words.
 */

/** Tone, icon and screen-reader wording per verdict. Words first, colour after. */
const TRAVEL_TONE = {
  comfortable: { box: 'border-emerald-500/40 text-emerald-300', icon: 'check' },
  tight:       { box: 'border-amber-500/40 text-amber-300',     icon: 'alert' },
  impossible:  { box: 'border-rose-500/45 text-rose-300',       icon: 'close' },
};

/**
 * The strip keeps its proportions rather than collapsing into slivers on a
 * phone, so below this width it scrolls inside its own box.
 */
const STRIP_MIN_WIDTH = '56rem';

function SessionBlock({ item }) {
  const s = item.session;
  const a = accent(s.venue.accent);
  const waitlisted = s.reservation === 'waitlisted';

  return (
    <Link
      role="listitem"
      to={`/sessions/${s.id}`}
      data-testid="timeline-session"
      data-minutes={item.minutes}
      data-venue={s.venue.shortName}
      style={{ flexGrow: item.minutes, flexBasis: 0 }}
      className="group block min-w-0 shrink-0"
      aria-label={
        `${s.title}, ${timeRange(s.startsAt, s.endsAt)}, ${duration(item.minutes)}, `
        + `${s.room.name} at ${s.venue.shortName}${waitlisted ? ', waitlist place' : ''}`
      }
      title={`${s.title} — ${timeRange(s.startsAt, s.endsAt)}`}
    >
      <div className={cx(
        'relative flex h-full flex-col justify-between gap-0.5 overflow-hidden rounded-lg border bg-raised/80 py-1.5 pl-2 pr-1.5',
        'transition-colors group-hover:bg-overlay',
        waitlisted ? 'border-dashed border-amber-400/50' : 'border-hairline',
      )}>
        {/* The venue's accent, as a bar rather than as the text colour: the
            block is mostly words, and they have to stay readable. */}
        <span className={cx('absolute inset-y-0 left-0 w-1', waitlisted ? 'bg-amber-400/60' : a.dot)} aria-hidden="true" />
        <span className="truncate font-mono text-[10px] text-faint">{s.startsAt}</span>
        <span className="truncate text-[11px] font-semibold leading-tight text-ink group-hover:text-violet-200">
          {s.title}
        </span>
        <span className="truncate text-[10px] text-muted">{s.room.name}</span>
      </div>
    </Link>
  );
}

function GapBlock({ item }) {
  const tone = item.isTravel ? TRAVEL_TONE[item.level] : null;
  const fastest = item.travel?.fastest;

  const description = item.isTravel
    ? `${duration(item.minutes)} between ${item.from} and ${item.to} — ${item.label}.`
      + ` Fastest is the ${fastest.mode.toLowerCase()}, ${fastest.total} min door to door.`
    : `${duration(item.minutes)} free between sessions`;

  return (
    <div
      role="listitem"
      data-testid={item.isTravel ? 'timeline-travel-gap' : 'timeline-gap'}
      data-minutes={item.minutes}
      data-level={item.level ?? 'free'}
      style={{ flexGrow: item.minutes, flexBasis: 0, minWidth: item.isTravel ? '5.25rem' : '2.75rem' }}
      className="min-w-0 shrink-0"
      aria-label={description}
      title={description}
    >
      <div className={cx(
        'flex h-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border px-1 text-center',
        item.isTravel ? cx('stripes', tone.box) : 'border-dashed border-hairline text-faint',
      )}>
        <Icon name={item.isTravel ? 'car' : 'clock'} className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate font-mono text-[10px] leading-none">{duration(item.minutes)}</span>
        {item.isTravel && (
          <span className="truncate text-[9px] font-semibold uppercase leading-none tracking-wide">
            {item.label}
          </span>
        )}
      </div>
    </div>
  );
}

export function DayTimeline({ day, travel }) {
  const timeline = useMemo(
    () => buildTimeline({ sessions: day.sessions, travel }),
    [day.sessions, travel],
  );

  // A day with nothing booked gets no strip rather than an empty one.
  if (!timeline) return null;

  const travelGaps = timeline.items.filter((i) => i.kind === 'gap' && i.isTravel);

  return (
    <figure className="mt-4" data-testid={`timeline-${day.date}`}>
      {/* Scrolls rather than squashes: below the floor width the blocks stop
          being readable, and the proportions are the point. */}
      <div className="overflow-x-auto pb-1">
        <div
          role="list"
          aria-label={`How ${dayLabel(day.date)} runs, ${fmtTime(timeline.startsAt)} to ${fmtTime(timeline.endsAt)}`}
          className="flex h-[4.5rem] items-stretch gap-1"
          style={{ minWidth: STRIP_MIN_WIDTH }}
        >
          {timeline.items.map((item) => (item.kind === 'session'
            ? <SessionBlock key={item.key} item={item} />
            : <GapBlock key={item.key} item={item} />))}
        </div>
      </div>

      <figcaption className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-faint">
        <span>{fmtTime(timeline.startsAt)} – {fmtTime(timeline.endsAt)}</span>
        <span aria-hidden="true">·</span>
        <span>{duration(timeline.endToEndMinutes)} end to end</span>
        {travelGaps.length > 0 && (
          <span className="inline-flex items-center gap-1 text-amber-300/90">
            <Icon name="car" className="size-3" aria-hidden="true" />
            {travelGaps.length === 1 ? 'one gap is the drive' : `${travelGaps.length} gaps are the drive`}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
