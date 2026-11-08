'use client';

import { Handshake, Scale, Siren, Truck, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, type CSSProperties } from 'react';

/** Target centre and outer radius in the SVG's 120×120 viewBox; the space up and left holds the arrow shaft. */
const CX = 68;
const CY = 66;
const R = 44;

/** Face colours from the outside in, two scoring rings per colour like a real archery face. */
const BANDS = ['#FFFFFF', '#0B1724', '#1D5FBF', '#D8483B', '#F2B33D'] as const;

interface Silo {
  icon: LucideIcon;
  label: string;
  /** Where the arrow lands, as an offset from the centre (viewBox units), and the shaft's angle in degrees. */
  hit: [number, number];
  angle: number;
}

const SILOS: Silo[] = [
  { icon: Truck, label: 'Shipment tracking', hit: [3, -2], angle: 32 },
  { icon: Handshake, label: 'Vendor management', hit: [-7, 5], angle: 38 },
  { icon: Siren, label: 'Cyber incident response', hit: [9, -6], angle: 26 },
  { icon: Scale, label: 'Risk evaluation', hit: [-4, 9], angle: 35 },
];

/**
 * The separate systems teams juggle today, drawn as foam archery blocks with an arrow in each face. When the row
 * scrolls into view the arrows fly in one after another and each face gives a small thud; with reduced motion, or
 * if the row is already on screen, the arrows are simply there.
 */
export function ArcheryBlocks() {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (list.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    list.dataset.archery = 'armed';
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        list.dataset.archery = 'hit';
        observer.disconnect();
      },
      { threshold: 0.5 }
    );
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  return (
    <ul
      ref={listRef}
      aria-label="Systems teams switch between today"
      className="mt-14 grid grid-cols-2 gap-x-5 gap-y-6 md:grid-cols-4 lg:mt-16 lg:gap-x-7"
    >
      {SILOS.map((silo, i) => (
        <li
          key={silo.label}
          style={{ '--i': i } as CSSProperties}
          className="relative flex flex-col items-center rounded-[22px] bg-[#FFFDF8] px-4 pt-6 pb-6 shadow-[7px_8px_0_#DCD2C0,0_22px_36px_-20px_rgba(11,23,36,0.38)] ring-1 ring-[#0B1724]/10 lg:px-6"
        >
          <silo.icon aria-hidden="true" className="absolute top-4 left-4 size-4 text-[#0B1724]/45" />
          <Target silo={silo} />
          <p className="mt-3 text-center text-sm/snug font-semibold text-balance text-[#0B1724] sm:text-base/snug">{silo.label}</p>
        </li>
      ))}
    </ul>
  );
}

function Target({ silo }: { silo: Silo }) {
  const [dx, dy] = silo.hit;
  const step = R / BANDS.length;

  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false" className="w-full max-w-[210px] overflow-visible">
      <g className="archery-face" style={{ transformOrigin: `${CX}px ${CY}px` }}>
        {BANDS.map((fill, b) => {
          const outer = R - b * step;
          const divider = b === 1 ? 'rgba(255,255,255,0.55)' : 'rgba(11,23,36,0.28)';
          return (
            <g key={fill}>
              <circle cx={CX} cy={CY} r={outer} fill={fill} stroke={b === 0 ? 'rgba(11,23,36,0.22)' : 'none'} strokeWidth="1" />
              <circle cx={CX} cy={CY} r={outer - step / 2} fill="none" stroke={divider} strokeWidth="0.6" />
            </g>
          );
        })}
        <circle cx={CX} cy={CY} r={1.6} fill="none" stroke="rgba(11,23,36,0.4)" strokeWidth="0.5" />
      </g>

      {/* The arrow points along +x in its own frame with the tip at the origin, so the fly-in and wobble work there. */}
      <g transform={`translate(${CX + dx} ${CY + dy}) rotate(${silo.angle})`}>
        <g className="archery-arrow">
          <circle r="2.2" fill="#0B1724" opacity="0.45" />
          <line x1="-48" y1="0" x2="0" y2="0" stroke="#0B1724" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M-46 0-40-6.5h10L-33 0Z" fill="#1D5FBF" />
          <path d="M-46 0-40 6.5h10L-33 0Z" fill="#8CC2F5" />
          <rect x="-50" y="-1.6" width="3.5" height="3.2" rx="0.8" fill="#0B1724" />
        </g>
      </g>
    </svg>
  );
}
