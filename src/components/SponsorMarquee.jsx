import { Link } from 'react-router-dom';
import { useFetch } from '../lib/store.jsx';
import * as api from '../lib/api.js';
import { GeneratedCover } from './GeneratedCover.jsx';
import { cx } from './ui.jsx';

const TOP_TIERS = ['Diamond', 'Platinum', 'Gold'];

/** The scrolling partner strip every conference site has. Pauses on hover. */
export function SponsorMarquee() {
  const { data } = useFetch(api.getSponsors, []);
  const sponsors = (data ?? []).filter((s) => TOP_TIERS.includes(s.tier));
  if (sponsors.length < 4) return null;

  // The track is rendered twice so the -50% translation loops seamlessly.
  const track = [...sponsors, ...sponsors];

  return (
    <section className="group relative overflow-hidden border-y border-hairline py-5" data-testid="sponsor-marquee">
      <h2 className="sr-only">Conference partners</h2>
      <div className="animate-marquee flex w-max items-center gap-10 group-hover:[animation-play-state:paused]">
        {track.map((s, i) => (
          <Link
            key={`${s.id}-${i}`}
            to="/expo"
            aria-hidden={i >= sponsors.length}
            tabIndex={i >= sponsors.length ? -1 : 0}
            className="flex shrink-0 items-center gap-2.5 opacity-55 transition-opacity hover:opacity-100"
          >
            <GeneratedCover seed={s.name} accent={s.accent} variant="mark" className="size-7 rounded-md" />
            <span className="whitespace-nowrap text-sm font-semibold tracking-tight">{s.name}</span>
          </Link>
        ))}
      </div>
      {/* fade the ends so items enter and leave rather than popping */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-ground to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-ground to-transparent" />
    </section>
  );
}
