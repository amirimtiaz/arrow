'use client';

import { Handshake, Scale, Siren, Truck, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, type CSSProperties } from 'react';

/** Target centre and outer radius in the SVG's 120×120 viewBox. */
const CX = 68;
const CY = 66;
const R = 44;

/** Face colours from the outside in, two scoring rings per colour like a real archery face. */
const BANDS = ['#FFFFFF', '#0B1724', '#1D5FBF', '#D8483B', '#F2B33D'] as const;

interface Silo {
  icon: LucideIcon;
  label: string;
  /**
   * Where the arrow tip lands in viewBox units (always well outside the face: every system misses) and the shaft's
   * angle in degrees, clockwise from pointing right. The shaft trails 50 units behind the tip.
   */
  tip: [number, number];
  angle: number;
}

const SILOS: Silo[] = [
  // Sailed high over the top and stuck in the upper corner.
  { icon: Truck, label: 'Shipment tracking', tip: [112, 10], angle: 24 },
  // Dropped short and dug into the bottom-left of the block.
  { icon: Handshake, label: 'Vendor management', tip: [14, 112], angle: 62 },
  // Came in from the wrong side; the nock hangs off the block's edge.
  { icon: Siren, label: 'Cyber incident response', tip: [124, 108], angle: 118 },
  // Skidded flat underneath the face.
  { icon: Scale, label: 'Risk evaluation', tip: [126, 117], angle: -4 },
];

/**
 * The separate systems teams juggle today, drawn as foam archery blocks where every arrow misses the target by a
 * mile. When the row scrolls into view the arrows fly in one after another and a puff of foam marks each miss; with
 * reduced motion, or if the row is already on screen, the arrows are simply there.
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
          <silo.icon aria-hidden="true" strokeWidth={1.75} className="absolute top-4 left-4 size-8 text-[#0B1724]/75 lg:size-9" />
          <Target silo={silo} />
          <p className="mt-3 text-center text-sm/snug font-semibold text-balance text-[#0B1724] sm:text-base/snug">{silo.label}</p>
        </li>
      ))}
    </ul>
  );
}

function Target({ silo }: { silo: Silo }) {
  const [tx, ty] = silo.tip;
  const step = R / BANDS.length;

  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false" className="w-full max-w-[210px] overflow-visible">
      <g>
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
      <g transform={`translate(${tx} ${ty}) rotate(${silo.angle})`}>
        {/* Foam kicked up where the tip went in: short splinters fanning back toward the archer. */}
        <g className="archery-burst" stroke="#0B1724" strokeOpacity="0.4" strokeWidth="1.1" strokeLinecap="round">
          <line x1="-3" y1="-3" x2="-8" y2="-9" />
          <line x1="-4" y1="0" x2="-11" y2="0" />
          <line x1="-3" y1="3" x2="-8" y2="9" />
          <line x1="1" y1="-4" x2="2" y2="-9" />
          <line x1="1" y1="4" x2="2" y2="9" />
        </g>
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
