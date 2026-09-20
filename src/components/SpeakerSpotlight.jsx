import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { accent } from '../lib/accents.js';
import { plural } from '../lib/format.js';
import { Avatar, Button, Chip, cx } from './ui.jsx';
import { Icon } from './Icon.jsx';
import { GeneratedCover } from './GeneratedCover.jsx';

const ROTATE_MS = 7000;

/**
 * The headliner spotlight — the big rotating panel a conference site opens
 * with. Photo-forward: a large portrait drifts slowly under a gradient while
 * the copy slides in beside it, and a filmstrip underneath lets you jump.
 *
 * Autoplay stops on hover, focus or any manual control, and never starts for
 * viewers who prefer reduced motion.
 */
export function SpeakerSpotlight({ speakers }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const go = useCallback((next) => {
    setIndex((i) => (next + speakers.length) % speakers.length);
  }, [speakers.length]);

  useEffect(() => {
    if (paused || reduceMotion.current || speakers.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % speakers.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused, speakers.length]);

  // Arrow keys move through the carousel when it has focus.
  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { setPaused(true); go(index + 1); }
    if (e.key === 'ArrowLeft') { setPaused(true); go(index - 1); }
  };

  if (!speakers.length) return null;
  const speaker = speakers[index];
  const a = accent(speaker.accent);

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-hairline bg-surface"
      aria-roledescription="carousel"
      aria-label="Featured speakers"
      data-testid="speaker-spotlight"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* ambient key art — kept well behind the copy so text stays readable */}
      <div key={`art-${speaker.id}`} className="absolute inset-0 animate-fade-zoom" aria-hidden="true">
        <GeneratedCover seed={speaker.name} accent={speaker.accent} variant="mesh" className="size-full opacity-30" />
        <div className="absolute inset-0 bg-surface/80" />
      </div>

      <div className="relative grid min-h-[22rem] gap-0 sm:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        {/* portrait */}
        <div className="relative h-56 overflow-hidden sm:h-auto">
          {speaker.imageUrl ? (
            <img
              key={`img-${speaker.id}`}
              src={speaker.imageUrl}
              alt=""
              className="animate-ken-burns size-full object-cover object-center"
            />
          ) : (
            <div key={`av-${speaker.id}`} className="grid size-full animate-fade-zoom place-items-center">
              <Avatar name={speaker.name} initials={speaker.initials} accent={speaker.accent} size="xl" className="size-40" />
            </div>
          )}
          {/* blend the photo into the panel on whichever edge matters */}
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/25 to-transparent sm:bg-gradient-to-r sm:from-transparent sm:via-surface/10 sm:to-surface" />
          <div className={cx('absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r sm:inset-y-0 sm:left-auto sm:right-0 sm:h-auto sm:w-1 sm:bg-gradient-to-b', a.grad)} />
        </div>

        {/* copy */}
        <div key={`copy-${speaker.id}`} className="flex animate-slide-in flex-col justify-center p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <Chip accent={speaker.accent}>
              <Icon name="mic" className="size-3" />
              Headliner
            </Chip>
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">
              {plural(speaker.sessionCount ?? 0, 'session')} · {speaker.city}
            </span>
          </div>

          <h3 className="mt-3 font-display text-4xl leading-[0.95] sm:text-5xl lg:text-6xl">
            {speaker.name}
          </h3>
          <p className="mt-2.5 text-sm text-muted sm:text-base">
            {speaker.jobTitle} · <span className="font-semibold text-ink">{speaker.company}</span>
          </p>
          <p className="mt-3 line-clamp-3 max-w-xl text-[13px] leading-relaxed text-muted">
            {speaker.bio}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button to={`/speakers/${speaker.id}`} variant="primary" size="sm">
              View profile <Icon name="chevronRight" className="size-3.5" />
            </Button>
            {speaker.expertise.slice(0, 3).map((e) => (
              <Chip key={e} className="!text-[10px]">{e}</Chip>
            ))}
          </div>
        </div>
      </div>

      {/* autoplay progress */}
      <div className="relative h-0.5 bg-overlay">
        {!paused && speakers.length > 1 && (
          <div
            key={`bar-${speaker.id}`}
            className={cx('animate-fill h-full bg-gradient-to-r', a.grad)}
            style={{ animationDuration: `${ROTATE_MS}ms` }}
          />
        )}
      </div>

      {/* filmstrip */}
      <div className="relative flex items-center gap-3 border-t border-hairline px-4 py-3 sm:px-6">
        <div className="hide-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto" role="tablist" aria-label="Choose a featured speaker">
          {speakers.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={s.name}
              title={s.name}
              onClick={() => { setPaused(true); go(i); }}
              className={cx(
                'relative shrink-0 overflow-hidden rounded-full transition-all duration-300',
                i === index
                  ? cx('size-11 ring-2 ring-offset-2 ring-offset-surface', a.ring)
                  : 'size-9 opacity-45 grayscale hover:opacity-100 hover:grayscale-0',
              )}
            >
              <Avatar name={s.name} initials={s.initials} accent={s.accent} imageUrl={s.imageUrl}
                size="md" ring={false} className="!size-full" />
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden font-mono text-[11px] text-faint sm:block">
            {String(index + 1).padStart(2, '0')} / {String(speakers.length).padStart(2, '0')}
          </span>
          <button type="button" aria-label="Previous speaker"
            onClick={() => { setPaused(true); go(index - 1); }}
            className="grid size-8 place-items-center rounded-lg border border-hairline bg-raised text-muted transition-colors hover:bg-overlay hover:text-ink">
            <Icon name="chevronLeft" className="size-4" />
          </button>
          <button type="button" aria-label="Next speaker" data-testid="spotlight-next"
            onClick={() => { setPaused(true); go(index + 1); }}
            className="grid size-8 place-items-center rounded-lg border border-hairline bg-raised text-muted transition-colors hover:bg-overlay hover:text-ink">
            <Icon name="chevronRight" className="size-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
