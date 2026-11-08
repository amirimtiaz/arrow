import clsx from 'clsx';
import { Handshake, Scale, Siren, Truck } from 'lucide-react';
import { ArrowMark } from './arrow-mark';
import { SectionIntro } from './section-intro';
import { CONTAINER, EYEBROW } from './styles';

const SILOS = [
  { icon: Truck, label: 'Shipment tracking' },
  { icon: Handshake, label: 'Vendor management' },
  { icon: Siren, label: 'Cyber incident response' },
  { icon: Scale, label: 'Risk evaluation' },
] as const;

/** Qualitative summaries only: no figures are quoted on the page. */
const WAKE_UP_CALLS = [
  {
    year: '2017',
    name: 'NotPetya and Maersk',
    text: 'Destructive malware spread through corporate networks and knocked out systems at the shipping company Maersk, showing how a cyberattack can stall physical logistics.',
  },
  {
    year: '2024',
    name: 'Change Healthcare',
    text: 'A ransomware attack on a healthcare payments platform disrupted prescription and insurance processing at pharmacies across the United States.',
  },
] as const;

export function ProblemSection() {
  return (
    <section aria-labelledby="problem-title" className="bg-[#F5F1E8] text-[#0B1724] [--accent:#1D5FBF]">
      <div className={clsx(CONTAINER, 'py-24 lg:py-32')}>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <SectionIntro
            id="problem-title"
            tone="light"
            eyebrow="The problem"
            title={
              <>
                One disruption.
                <br />
                Too many systems.
              </>
            }
            className="lg:col-span-6"
          />

          <div className="lg:col-span-6 lg:pt-12">
            <p className="text-lg/8 text-[#0B1724]/80">
              Supply chains power the global economy. Yet critical decisions depend on separate systems for tracking shipments, managing
              vendors, responding to cyber incidents and evaluating risk. When something breaks, teams lose precious time stitching the
              picture together instead of acting on it.
            </p>

            <ul aria-label="Systems teams switch between today" className="mt-8 flex flex-wrap gap-2.5">
              {SILOS.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="inline-flex items-center gap-2 rounded-full border border-dashed border-[#0B1724]/30 px-4 py-2 text-sm font-medium text-[#0B1724]/75"
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {label}
                </li>
              ))}
            </ul>

            <p className="mt-7 flex items-center gap-3 text-base font-semibold">
              <ArrowMark className="h-3.5 w-auto shrink-0 text-[#1D5FBF]" />
              Arrow brings them into one live command center.
            </p>
          </div>
        </div>

        <div className="mt-20 grid gap-5 md:grid-cols-2 lg:mt-24">
          {WAKE_UP_CALLS.map((event) => (
            <article key={event.year} className="rounded-[28px] bg-white/75 p-8 ring-1 ring-[#0B1724]/10 lg:p-10">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <p className="font-display text-[length:clamp(3rem,4.6vw,4.5rem)] leading-none">{event.year}</p>
                <p className={clsx(EYEBROW, 'text-[#0B1724]/55')}>Real-world wake-up call</p>
              </div>
              <h3 className="mt-6 text-xl font-semibold tracking-[-0.01em]">{event.name}</h3>
              <p className="mt-2 text-base/7 text-[#0B1724]/75">{event.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
