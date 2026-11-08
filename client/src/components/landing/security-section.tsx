import clsx from 'clsx';
import { ArrowRight, KeyRound, Link2, Server, ShieldCheck } from 'lucide-react';
import type { CSSProperties } from 'react';
import { BANK_HEIGHT, CloudBank } from './clouds';
import { PillLink } from './pill-link';
import { SectionIntro } from './section-intro';
import { CONTAINER } from './styles';

const SAFEGUARDS = [
  { icon: Server, label: 'Separate database', note: 'Incident data lives in its own database, apart from operations.' },
  { icon: KeyRound, label: 'Invite-only, one-time codes', note: 'Shared in person; only a hash is stored.' },
  { icon: ShieldCheck, label: 'Server-side role checks', note: 'Every action is checked against the caller’s role.' },
  { icon: Link2, label: 'Hash-chained audit log', note: 'Each entry seals the one before it. Verify any time.' },
] as const;

export function SecuritySection() {
  return (
    <section data-scroll-scope id="security" aria-labelledby="security-title" className="relative bg-[#08131F] text-[#F5F1E8]">
      <CloudBank edge="top" seed={53} over="navy" />
      <div
        className={clsx(CONTAINER, 'grid gap-14 pb-24 lg:grid-cols-12 lg:gap-16 lg:pb-32')}
        style={{ paddingTop: `calc(${BANK_HEIGHT} + 3.5rem)` }}
      >
        <div className="lg:col-span-6">
          <SectionIntro
            id="security-title"
            tone="dark"
            eyebrow="Security"
            title={
              <>
                Built for the day
                <br />
                the network is compromised.
              </>
            }
          />
          <p data-reveal className="mt-6 max-w-xl text-lg/8 text-[#F5F1E8]/72">
            The Cyber Control Tower is an isolated command center for responders. It runs on its own SpacetimeDB database, separate from
            operations. People join only with a one-time invite code that an admin shares in person, every action is checked against the
            member’s role on the server, and every change is appended to a hash-chained audit log the team can verify from the dashboard.
          </p>
          <div className="mt-9">
            <PillLink href="/app/control-tower" variant="cream-outline">
              Open Control Tower
              <ArrowRight aria-hidden="true" className="size-4" />
            </PillLink>
          </div>
        </div>

        <div className="lg:col-span-6 lg:pt-10">
          <ul className="divide-y divide-[#F5F1E8]/10 border-y border-[#F5F1E8]/10">
            {SAFEGUARDS.map(({ icon: Icon, label, note }, i) => (
              <li
                key={label}
                data-reveal="right"
                style={{ '--reveal-delay': `${i * 120}ms` } as CSSProperties}
                className="flex items-start gap-5 py-6"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#F5F1E8]/8 text-[#8CC2F5]">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div>
                  <p className="text-lg font-semibold tracking-[-0.01em]">{label}</p>
                  <p className="mt-1 text-[15px]/6 text-[#F5F1E8]/65">{note}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm/6 text-[#F5F1E8]/55">
            Designed for a compromised corporate network, identity provider or chat. It cannot protect a responder’s own compromised device.
          </p>
        </div>
      </div>
    </section>
  );
}
