import clsx from 'clsx';
import Image from 'next/image';
import type { CSSProperties } from 'react';
import { ArcheryBlocks } from './archery-blocks';
import { ArrowMark } from './arrow-mark';
import { SectionIntro } from './section-intro';
import { CONTAINER, EYEBROW } from './styles';

interface CaseStudy {
  year: string;
  name: string;
  text: string;
  photo: { src: string; alt: string; credit: string };
  /** `className` sets the logo's height, so wordmarks of different shapes read at a similar size. */
  logo: { src: string; alt: string; width: number; height: number; className: string };
  /** Every figure comes from the linked reporting of the company's own disclosures. */
  impact: { value: string; label: string }[];
  sources: { label: string; href: string }[];
}

/** Each case study sits at its own slight angle and height (from md) and straightens when hovered. */
const CARD_POSE = [
  'transition-[rotate] duration-500 md:-rotate-1 md:hover:rotate-0',
  'transition-[rotate] duration-500 md:mt-24 md:rotate-[0.8deg] md:hover:rotate-0',
] as const;

/** Real events told as case studies only: what happened and what it cost. No Arrow pitch inside these cards. */
const WAKE_UP_CALLS: CaseStudy[] = [
  {
    year: '2017',
    name: 'NotPetya and Maersk',
    text: 'Destructive malware tore through Maersk’s corporate network in June 2017. Container terminals, including APM Terminals in Rotterdam, stopped working, and one of the world’s largest shipping companies had to run on paper and phone calls while it rebuilt.',
    photo: {
      src: '/images/landing/case-maersk-rotterdam.jpg',
      alt: 'Light-blue ship-to-shore container cranes at the APM Terminals Maasvlakte II terminal in the Port of Rotterdam.',
      credit: 'APM Terminals Maasvlakte II, Rotterdam (2019). Photo: Spielvogel, CC BY-SA 4.0',
    },
    logo: { src: '/images/landing/logo-maersk.svg', alt: 'Maersk', width: 135, height: 31, className: 'h-7 sm:h-9 lg:h-11' },
    impact: [
      { value: '$250–300M', label: 'estimated losses, by Maersk’s own count' },
      { value: '45,000', label: 'PCs reinstalled, plus 4,000 servers' },
      { value: '10 days', label: 'to rebuild the whole IT network' },
    ],
    sources: [
      {
        label: 'Supply Chain Dive',
        href: 'https://www.supplychaindive.com/news/maersk-reconstructed-entire-it-infrastructure-in-10-days-following-nyetya/515776/',
      },
      { label: 'SecurityWeek', href: 'https://www.securityweek.com/maersk-reinstalled-50000-computers-after-notpetya-attack/' },
    ],
  },
  {
    year: '2024',
    name: 'Change Healthcare',
    text: 'In February 2024 ransomware took down Change Healthcare, which routes claims and prescriptions for much of US healthcare. For weeks, pharmacies across the country struggled to check insurance or fill prescriptions, and some patients paid full price or went without.',
    photo: {
      src: '/images/landing/case-change-pharmacy.jpg',
      alt: 'A pharmacist in a white coat reaches for a box of medication on a pharmacy shelf.',
      credit: 'Photo: National Cancer Institute on Unsplash',
    },
    logo: {
      src: '/images/landing/logo-change-healthcare.svg',
      alt: 'Change Healthcare, part of Optum',
      width: 120,
      height: 52,
      className: 'h-11 sm:h-14 lg:h-[4.5rem]',
    },
    impact: [
      { value: '$3.09B', label: 'cost to UnitedHealth Group in 2024' },
      { value: '190M+', label: 'people whose data was exposed' },
      { value: '$22M', label: 'ransom paid to the attackers' },
    ],
    sources: [
      {
        label: 'Becker’s',
        href: 'https://www.beckershospitalreview.com/cybersecurity/the-financial-toll-of-the-change-healthcare-hack-7-numbers.html',
      },
      {
        label: 'Healthcare Innovation',
        href: 'https://www.hcinnovationgroup.com/cybersecurity/data-breaches/news/55263828/change-healthcare-tallies-190-million-data-breach-victims',
      },
    ],
  },
];

export function ProblemSection() {
  return (
    <section data-scroll-scope aria-labelledby="problem-title" className="relative bg-[#F5F1E8] text-[#0B1724] [--accent:#1D5FBF]">
      {/* The hero's cloud bank already opens this section, so less top padding; the bottom clears the next bank. */}
      <div className={clsx(CONTAINER, 'pt-12 pb-24 lg:pt-16 lg:pb-32')}>
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

          <div data-reveal="right" className="lg:col-span-6 lg:pt-12">
            <p className="text-lg/8 text-[#0B1724]/80">
              Supply chains power the global economy. Yet critical decisions depend on separate systems for tracking shipments, managing
              vendors, responding to cyber incidents and evaluating risk. When something breaks, teams lose precious time stitching the
              picture together instead of acting on it.
            </p>
          </div>
        </div>

        <ArcheryBlocks />

        <p data-reveal="left" className="mt-10 flex items-center gap-3 text-base font-semibold lg:text-lg">
          <ArrowMark className="h-3.5 w-auto shrink-0 text-[#1D5FBF]" />
          Arrow brings them into one live command center.
        </p>

        <div className="mt-20 grid items-start gap-8 md:grid-cols-2 md:gap-6 lg:mt-24">
          {WAKE_UP_CALLS.map((event, i) => (
            <div key={event.year} data-reveal="zoom" style={{ '--reveal-delay': `${i * 160}ms` } as CSSProperties} className={CARD_POSE[i]}>
              <CaseStudyCard event={event} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CaseStudyCard({ event }: { event: CaseStudy }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_30px_60px_-34px_rgba(11,23,36,0.45)] ring-1 ring-[#0B1724]/10">
      <figure className="relative aspect-[16/9] overflow-hidden bg-[#DCD2C0]">
        <Image
          src={event.photo.src}
          alt={event.photo.alt}
          fill
          sizes="(min-width: 1360px) 660px, (min-width: 768px) 50vw, 100vw"
          className="object-cover transition-[scale] duration-700 ease-out group-hover:scale-[1.04]"
        />
        <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-[#04101C]/70 to-transparent px-4 pt-8 pb-2 text-right text-[11px] text-white/85">
          {event.photo.credit}
        </figcaption>
      </figure>

      <div className="@container flex flex-1 flex-col p-8 lg:p-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <p className={clsx(EYEBROW, 'text-[#0B1724]/55')}>Real-world wake-up call</p>
            <p className="mt-3 font-display text-[length:clamp(3rem,4.6vw,4.5rem)] leading-none">{event.year}</p>
          </div>
          <Image
            src={event.logo.src}
            alt={event.logo.alt}
            width={event.logo.width}
            height={event.logo.height}
            unoptimized
            className={clsx('mt-1 w-auto shrink-0', event.logo.className)}
          />
        </div>

        <h3 className="mt-6 text-xl font-semibold tracking-[-0.01em]">{event.name}</h3>
        <p className="mt-2 text-base/7 text-[#0B1724]/75">{event.text}</p>

        {/* Narrow cards (phones, and two-up cards below xl): one figure per row, value first. Wider cards: three columns. */}
        <dl aria-label={`Impact of ${event.name}`} className="mt-8 grid gap-4 border-t border-[#0B1724]/10 pt-6 @sm:grid-cols-3">
          {event.impact.map((stat) => (
            <div
              key={stat.value}
              className="flex flex-row-reverse items-baseline justify-end gap-3 @sm:flex-col-reverse @sm:items-stretch @sm:gap-1.5"
            >
              <dt className="text-[13px]/5 text-[#0B1724]/65">{stat.label}</dt>
              <dd className="w-32 shrink-0 font-display text-[length:clamp(1.6rem,2.3vw,2.25rem)] leading-none whitespace-nowrap text-[#C42127] @sm:w-auto">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-auto pt-6 text-xs text-[#0B1724]/55">
          Sources:{' '}
          {event.sources.map((source, i) => (
            <span key={source.href}>
              {i > 0 && ', '}
              <a href={source.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-[#0B1724]">
                {source.label}
              </a>
            </span>
          ))}
        </p>
      </div>
    </article>
  );
}
