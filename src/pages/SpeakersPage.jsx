import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useConference, useFetch } from '../lib/store.jsx';
import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import * as api from '../lib/api.js';
import { accent } from '../lib/accents.js';
import { plural, shortDay } from '../lib/format.js';
import { SpeakerCard } from '../components/SpeakerCard.jsx';
import { SpeakerSpotlight } from '../components/SpeakerSpotlight.jsx';
import { SearchInput, Select, ChipGroup } from '../components/FilterBar.jsx';
import { Button, EmptyState, ErrorState, SectionHeader, Skeleton, cx } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

const ALL = 'all';
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** The long tail, grouped alphabetically with a jump bar — 89 rows in one flat column is unusable. */
function AlphabeticalList({ speakers }) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const s of [...speakers].sort((a, b) => a.name.localeCompare(b.name))) {
      const letter = s.name[0].toUpperCase();
      if (!map.has(letter)) map.set(letter, []);
      map.get(letter).push(s);
    }
    return map;
  }, [speakers]);

  const jump = (letter) => {
    document.getElementById(`letter-${letter}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div>
      <div className="sticky top-16 z-20 -mx-1 mb-3 flex flex-wrap gap-0.5 rounded-xl border border-hairline bg-surface/95 p-1.5 backdrop-blur">
        {LETTERS.map((letter) => {
          const has = groups.has(letter);
          return (
            <button
              key={letter}
              type="button"
              disabled={!has}
              onClick={() => jump(letter)}
              aria-label={has ? `Jump to ${letter}` : `No speakers under ${letter}`}
              className={cx(
                'size-6 rounded text-[11px] font-bold transition-colors',
                has ? 'text-muted hover:bg-overlay hover:text-ink' : 'cursor-default text-faint/25',
              )}
            >
              {letter}
            </button>
          );
        })}
      </div>

      <div className="space-y-6">
        {[...groups.entries()].map(([letter, people]) => (
          <div key={letter} id={`letter-${letter}`} className="scroll-mt-32">
            <h3 className="mb-2 flex items-baseline gap-3 px-1">
              <span className="font-display text-lg text-faint">{letter}</span>
              <span className="h-px flex-1 bg-hairline" />
              <span className="text-[11px] text-faint">{people.length}</span>
            </h3>
            <div className="card grid grid-cols-2 gap-0.5 p-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {people.map((s) => <SpeakerCard key={s.id} speaker={s} variant="compact" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SpeakersPage() {
  useDocumentTitle('Speakers');
  const { tracks, days, followingIds } = useConference();
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const track = params.get('track') ?? ALL;
  const day = params.get('day') ?? ALL;
  const view = params.get('show') ?? ALL; // all | following | keynotes | first-time
  const sort = params.get('sort') ?? 'featured';

  const set = (key, value) => {
    const next = new URLSearchParams(params);
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const { data, loading, error, reload } = useFetch(
    () => api.getSpeakers({
      q,
      trackSlug: track,
      day,
      featured: view === 'keynotes' ? 'true' : undefined,
      firstTime: view === 'first-time' ? 'true' : undefined,
    }),
    [q, track, day, view],
  );

  const all = useMemo(() => {
    let list = [...(data ?? [])];
    if (view === 'following') list = list.filter((s) => followingIds.has(s.id));
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'sessions') list.sort((a, b) => (b.sessionCount ?? 0) - (a.sessionCount ?? 0));
    if (sort === 'rating') list.sort((a, b) => b.avgRating - a.avgRating);
    return list;
  }, [data, sort, view, followingIds]);

  const narrowed = Boolean(q) || track !== ALL || day !== ALL || view !== ALL;
  const followed = all.filter((s) => followingIds.has(s.id));
  const headline = all.filter((s) => s.featured && !followingIds.has(s.id));
  // Once narrowed, the headliner spotlight is hidden, so featured people belong in the results.
  const rest = all.filter((s) => (narrowed || !s.featured) && !followingIds.has(s.id));

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Who is talking"
        title="Speakers"
        description={narrowed
          ? 'Everyone matching your search and filters.'
          : 'Every one of them presenting at least once.'}
        action={
          <span className="text-xs text-muted" data-testid="result-count">
            {loading ? 'Loading…' : plural(all.length, 'speaker')}
          </span>
        }
      />

      <div className="card space-y-3.5 p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
          <SearchInput value={q} onChange={(v) => set('q', v)} placeholder="Name, company, expertise…"
            data-testid="speaker-search" />
          <Select label="Sort" value={sort} onChange={(v) => set('sort', v)}
            options={[
              { value: 'featured', label: 'Most prominent' },
              { value: 'sessions', label: 'Most sessions' },
              { value: 'rating', label: 'Highest rated' },
              { value: 'name', label: 'A–Z' },
            ]} />
        </div>

        <ChipGroup
          label="Show"
          value={view}
          onChange={(v) => set('show', v)}
          options={[
            { value: ALL, label: 'Everyone', testId: 'filter-all' },
            {
              value: 'following',
              label: 'Following',
              icon: 'check',
              count: followingIds.size || undefined,
              disabled: followingIds.size === 0,
              title: followingIds.size === 0 ? 'You are not following anyone yet' : undefined,
              testId: 'filter-following',
              activeClass: 'border-emerald-400/50 bg-emerald-500/15 text-ink',
            },
            { value: 'keynotes', label: 'Keynotes', icon: 'mic', testId: 'filter-keynotes' },
            { value: 'first-time', label: 'First-timers', icon: 'sparkle', testId: 'filter-first-time' },
          ]}
        />

        <ChipGroup
          label="Day"
          value={day}
          onChange={(v) => set('day', v)}
          options={[
            { value: ALL, label: 'Any day' },
            ...days.map((d) => ({
              value: d.date,
              label: `${d.label} · ${shortDay(d.date)}`,
              testId: `speaker-day-${d.date}`,
            })),
          ]}
        />

        <ChipGroup
          label="Track"
          value={track}
          onChange={(v) => set('track', v)}
          options={[
            { value: ALL, label: 'All tracks' },
            ...tracks.map((t) => {
              const a = accent(t.color);
              return {
                value: t.slug,
                label: t.shortName ?? t.name,
                title: t.name,
                dot: a.dot,
                activeClass: a.chip,
              };
            }),
          ]}
        />
      </div>

      {loading && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="h-56" />)}
        </div>
      )}
      {error && <ErrorState error={error} onRetry={reload} />}

      {!loading && !error && all.length === 0 && (
        <EmptyState
          icon="users"
          title={view === 'following' ? 'You are not following anyone yet' : 'No speakers match'}
          description={view === 'following'
            ? 'Follow a speaker from their profile and they collect here, with everything they are presenting.'
            : 'Try a different search, day or track.'}
          action={<Button size="sm" onClick={() => setParams(new URLSearchParams())}>Show everyone</Button>}
        />
      )}

      {/* People you follow always come first, whatever else is on screen. */}
      {!loading && followed.length > 0 && (
        <section data-testid="followed-speakers">
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className="font-display text-xl">Following</h2>
            <span className="h-px flex-1 bg-hairline" />
            <span className="text-[11px] text-faint">{plural(followed.length, 'speaker')}</span>
          </div>
          <div className="stagger grid gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {followed.map((s, i) => (
              <div key={s.id} style={{ '--i': Math.min(i, 12) }} className="contents">
                <SpeakerCard speaker={s} />
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && !narrowed && headline.length > 0 && (
        <section data-testid="headline-speakers">
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className="font-display text-xl">The headliners</h2>
            <span className="h-px flex-1 bg-hairline" />
            <span className="text-[11px] text-faint">
              {plural(headline.filter((s) => s.keynoteCount > 0).length, 'keynote')}
              {' · '}{headline.length} featured
            </span>
          </div>
          <SpeakerSpotlight speakers={headline} />
        </section>
      )}

      {!loading && rest.length > 0 && (
        <section data-testid="all-speakers">
          <div className="mb-3 flex items-baseline gap-3">
            <h2 className="font-display text-xl">
              {narrowed ? 'Matching speakers' : 'Everyone else on the programme'}
            </h2>
            <span className="h-px flex-1 bg-hairline" />
            <span className="text-[11px] text-faint" data-testid="speaker-count">{rest.length}</span>
          </div>

          {narrowed || sort !== 'featured'
            ? (
              <div className="card grid grid-cols-2 gap-0.5 p-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {rest.map((s) => <SpeakerCard key={s.id} speaker={s} variant="compact" />)}
              </div>
            )
            : <AlphabeticalList speakers={rest} />}
        </section>
      )}
    </div>
  );
}
