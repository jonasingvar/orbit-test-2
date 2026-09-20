import { useDocumentTitle } from '../lib/useDocumentTitle.js';
import { SectionHeader, cx } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

const EXPECTED = [
  'Assume the people around you know something you do not.',
  'Critique ideas and systems, never the person presenting them.',
  'Ask before photographing anyone, including in workshop rooms.',
  'Leave room in Q&A for people who have not spoken yet.',
  'Respect the quiet room. It is quiet.',
];

const UNACCEPTABLE = [
  'Harassment, intimidation or sustained disruption of a session.',
  'Comments that demean anyone on the basis of who they are.',
  'Unwelcome attention after being asked to stop.',
  'Recording or sharing a workshop without the room’s consent.',
];

export function CodeOfConductPage() {
  useDocumentTitle('Code of conduct');

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <SectionHeader
        eyebrow="Everyone here"
        title="Code of conduct"
        description="ORBIT is 8,400 people in a building for four days. This is the short version of how that works."
      />

      <div className="card p-6 sm:p-8">
        <p className="text-[15px] leading-relaxed text-muted">
          We want a conference where someone two years into their career can ask a naive question of
          someone twenty years in, and get a straight answer. Everything below follows from that.
        </p>
      </div>

      {[
        { title: 'What we expect', items: EXPECTED, icon: 'check', tone: 'text-emerald-300' },
        { title: 'What is not acceptable', items: UNACCEPTABLE, icon: 'close', tone: 'text-rose-300' },
      ].map((block) => (
        <section key={block.title}>
          <h2 className="font-display text-2xl">{block.title}</h2>
          <ul className="mt-4 space-y-3">
            {block.items.map((item) => (
              <li key={item} className="flex gap-3 text-[15px] leading-relaxed text-muted">
                <Icon name={block.icon} className={cx('mt-1 size-4 shrink-0', block.tone)} />
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] p-6">
        <h2 className="flex items-center gap-2 font-display text-xl text-amber-200">
          <Icon name="alert" className="size-5" />
          Reporting something
        </h2>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">
          Any staff member in an orange lanyard can help, at either site. The conduct desk is next to
          registration on Level 1 at Aurora and inside the main door at the Foundry. Reports are handled
          by two named organisers and are not shared with the wider team.
        </p>
        <p className="mt-3 font-mono text-[13px] text-amber-200">conduct@orbitconf.dev · +1 702 555 0142</p>
      </section>
    </div>
  );
}
