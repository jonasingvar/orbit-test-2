import { useConference } from '../lib/store.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { accent } from '../lib/accents.js';
import { plural } from '../lib/format.js';
import { Chip, SectionHeader, cx } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

/**
 * Built from the room data rather than hand-written prose, so it cannot drift
 * out of date: if a room's `accessible` flag or amenities change, this changes.
 */
export function AccessibilityPage() {
  useDocumentTitle('Accessibility');
  const { rooms: allRooms, venueById } = useConference();

  const rooms = allRooms.map((r) => ({ ...r, venue: venueById[r.venueId] }));
  const stepFree = rooms.filter((r) => r.accessible);
  const notStepFree = rooms.filter((r) => !r.accessible);
  const withAmenity = (a) => rooms.filter((r) => r.amenities.includes(a));

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <SectionHeader
        eyebrow="Getting around"
        title="Accessibility"
        description="What each room actually offers, generated from the venue data — not a statement of intent."
      />

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          [stepFree.length, 'Step-free rooms', 'emerald'],
          [withAmenity('Hearing loop').length, 'Hearing loops', 'sky'],
          [withAmenity('Live captions').length, 'Live captions', 'violet'],
          [notStepFree.length, 'Stairs only', notStepFree.length ? 'amber' : 'emerald'],
        ].map(([value, label, tone]) => {
          const a = accent(tone);
          return (
            <div key={label} className="card px-4 py-3.5">
              <div className={cx('font-display text-3xl leading-none', a.text)}>{value}</div>
              <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">{label}</div>
            </div>
          );
        })}
      </div>

      {notStepFree.length > 0 && (
        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-6" data-testid="stairs-only">
          <h2 className="flex items-center gap-2 font-display text-xl text-amber-200">
            <Icon name="alert" className="size-5" />
            {plural(notStepFree.length, 'room')} without step-free access
          </h2>
          <ul className="mt-4 space-y-3">
            {notStepFree.map((r) => (
              <li key={r.id} className="text-[14px]">
                <span className="font-semibold">{r.name}</span>
                <span className="text-muted"> · {r.venue.shortName}, {r.floor}</span>
                <p className="mt-0.5 text-[13px] text-muted">
                  Everything scheduled here is also livestreamed to a step-free room at the same site.
                  Ask any orange lanyard and they will walk you there.
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-display text-2xl">Room by room</h2>
        <div className="mt-4 card divide-y divide-hairline">
          {rooms.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{r.name}</div>
                <div className="truncate text-[11px] text-faint">
                  {r.venue.shortName} · {r.building} · {r.floor} · ~{r.walkMinutes} min from the entrance
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {r.accessible
                  ? <Chip accent="emerald" className="!py-0.5 !text-[10px]">Step-free</Chip>
                  : <Chip accent="amber" className="!py-0.5 !text-[10px]">Stairs only</Chip>}
                {['Hearing loop', 'Live captions', 'Quiet space'].filter((a) => r.amenities.includes(a)).map((a) => (
                  <Chip key={a} className="!py-0.5 !text-[10px]">{a}</Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-display text-xl">Anything else</h2>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">
          Context Window on Level 3 at Aurora is a quiet room from 09:00–18:00 every day — no sessions,
          no calls. Shuttles between the two sites are step-free with a deployable ramp. If you need
          something that is not listed here, email us before the event and we will arrange it.
        </p>
        <p className="mt-3 font-mono text-[13px] text-violet-300">access@orbitconf.dev</p>
      </section>
    </div>
  );
}
