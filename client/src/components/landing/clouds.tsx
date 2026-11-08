import clsx from 'clsx';
import type { CSSProperties, ReactNode } from 'react';

/*
 * Clouds for the marketing page. Everything here is static SVG; the motion comes from CSS in globals.css:
 * `.parallax` moves an element by `--p` (set per section by scroll-effects.tsx) times its `--px` / `--py`, and
 * `.cloud-drift` adds a slow idle float. Both switch off with prefers-reduced-motion.
 */

/** Cream sections are "cloud layers": their edges are drawn as cloud banks in this exact colour. */
const CREAM = '#F5F1E8';

type Vars = CSSProperties & Record<`--${string}`, string>;

/** Shared gradient and blur filters, rendered once per page and referenced by id from every cloud. */
export function CloudDefs() {
  return (
    <svg aria-hidden="true" focusable="false" width="0" height="0" className="pointer-events-none absolute">
      <defs>
        {/* User-space units so one gradient spans a whole cloud (120×60 viewBox) and the puffs merge without seams. */}
        <linearGradient id="arrow-cloud-sky" gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2="58">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.55" stopColor="#F4F8FC" />
          <stop offset="1" stopColor="#C6D6E8" />
        </linearGradient>
        <filter id="arrow-cloud-soft" x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
        <filter id="arrow-cloud-haze" x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>
      </defs>
    </svg>
  );
}

/* ── Sky clouds ─────────────────────────────────────────────────────────────── */

/** Two cumulus silhouettes in a 120×60 box: a flat-ish base, puffs of different sizes and a lumpy underside. */
const SHAPES: ReactNode[] = [
  <>
    <rect x="10" y="28" width="100" height="22" rx="11" />
    <circle cx="13" cy="40" r="8.5" />
    <circle cx="24" cy="33" r="12" />
    <circle cx="42" cy="25" r="15" />
    <circle cx="64" cy="21" r="17.5" />
    <circle cx="86" cy="26" r="14" />
    <circle cx="102" cy="35" r="10" />
    <circle cx="34" cy="48" r="6" />
    <circle cx="58" cy="49.5" r="6.5" />
    <circle cx="82" cy="48" r="6" />
  </>,
  <>
    <rect x="6" y="32" width="108" height="18" rx="9" />
    <circle cx="14" cy="40" r="9" />
    <circle cx="30" cy="31" r="13" />
    <circle cx="50" cy="27" r="11" />
    <circle cx="70" cy="22" r="16" />
    <circle cx="92" cy="30" r="12.5" />
    <circle cx="107" cy="38" r="8" />
    <circle cx="44" cy="48" r="5.5" />
    <circle cx="76" cy="49" r="6" />
  </>,
];

interface SkyCloudProps {
  /** Position and width (Tailwind classes); the height follows the 2:1 shape. */
  className: string;
  shape?: 0 | 1;
  /** Pixels moved per viewport of scrolling (parallax). */
  px?: number;
  py?: number;
  /** Idle float: seconds per cycle and how far it wanders. */
  drift?: number;
  driftX?: number;
  flip?: boolean;
}

/** A soft white cumulus that floats in place and slides with the scroll. Decorative only. */
export function SkyCloud({ className, shape = 0, px = 0, py = 0, drift = 28, driftX = 28, flip = false }: SkyCloudProps) {
  return (
    <div
      aria-hidden="true"
      className={clsx('parallax pointer-events-none absolute', className)}
      style={{ '--px': `${px}px`, '--py': `${py}px` } as Vars}
    >
      <div className="cloud-drift" style={{ '--drift-s': `${drift}s`, '--drift-x': `${driftX}px` } as Vars}>
        <svg
          viewBox="0 0 120 60"
          focusable="false"
          className={clsx('block h-auto w-full overflow-visible drop-shadow-[0_14px_26px_rgba(4,16,30,0.16)]', flip && '-scale-x-100')}
        >
          <g filter="url(#arrow-cloud-soft)" fill="url(#arrow-cloud-sky)">
            {SHAPES[shape]}
          </g>
          {/* Sunlit crowns. */}
          <g fill="#FFFFFF" filter="url(#arrow-cloud-haze)">
            <ellipse cx="62" cy="12" rx="11" ry="4.5" />
            <ellipse cx="40" cy="17" rx="7" ry="3.5" opacity="0.9" />
            <ellipse cx="88" cy="20" rx="6" ry="3" opacity="0.85" />
          </g>
        </svg>
      </div>
    </div>
  );
}

/* ── Cloud banks (section edges) ────────────────────────────────────────────── */

/** Bank geometry: a 1600×192 viewBox, about the 8.3:1 box the bank fills at 14vw tall (116% wide for overscan). */
const BANK_W = 1600;
const BANK_H = 192;

interface Puff {
  cx: number;
  cy: number;
  r: number;
}

/** Deterministic pseudo-random sequence, so the server and every client draw the same bank. */
function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * A row of overlapping puffs along `base`. Sizes are skewed small with the odd towering one, and every few puffs a
 * small one tucks in front, so the edge reads as cumulus instead of a regular scallop. Crowns stay inside the box.
 */
function puffRow(seed: number, base: number, minR: number, maxR: number): Puff[] {
  const rand = seeded(seed);
  const puffs: Puff[] = [];
  let x = -60;
  while (x < BANK_W + 60) {
    const t = rand();
    const r = minR + t * t * (maxR - minR);
    const lift = r * (0.15 + rand() * 0.45);
    puffs.push({ cx: Math.round(x), cy: Math.round(Math.max(base - lift, r + 4)), r: Math.round(r) });
    if (rand() < 0.35) {
      const small = minR * (0.6 + rand() * 0.4);
      puffs.push({ cx: Math.round(x + r * 0.7), cy: Math.round(base - small * 0.1), r: Math.round(small) });
    }
    x += r * (0.75 + rand() * 0.5);
  }
  return puffs;
}

function BankLayer({
  puffs,
  base,
  px,
  py,
  className,
  layer,
  shade,
}: {
  puffs: Puff[];
  base: number;
  px: number;
  py: number;
  className?: string;
  /** `front`: solid cream that carries the edge. `back`: hazy white mist behind it. */
  layer: 'front' | 'back';
  shade: boolean;
}) {
  const fill = layer === 'front' ? CREAM : '#FFFFFF';
  return (
    <div
      className={clsx('parallax absolute inset-y-0 -left-[8%] w-[116%]', className)}
      style={{ '--px': `${px}px`, '--py': `${py}px` } as Vars}
    >
      <svg viewBox={`0 0 ${BANK_W} ${BANK_H}`} preserveAspectRatio="xMidYMax slice" focusable="false" className="block h-full w-full">
        {/* A slightly darker copy, nudged down and blurred, gives each puff a soft underside where it meets the next. */}
        {shade && (
          <g fill="#E3D9C6" filter="url(#arrow-cloud-haze)" transform="translate(4 7)">
            {puffs.map((p, i) => (
              <circle key={i} cx={p.cx} cy={p.cy} r={p.r} />
            ))}
          </g>
        )}
        <g fill={fill} filter={`url(#${layer === 'front' ? 'arrow-cloud-soft' : 'arrow-cloud-haze'})`}>
          {puffs.map((p, i) => (
            <circle key={i} cx={p.cx} cy={p.cy} r={p.r} />
          ))}
        </g>
        <rect x="-50" y={base} width={BANK_W + 100} height={BANK_H - base + 10} fill={fill} />
      </svg>
    </div>
  );
}

interface CloudBankProps {
  /** `bottom`: rises from the bottom of its section into the cream section below. `top`: hangs from the top. */
  edge: 'top' | 'bottom';
  /** Picks a different puff pattern for each edge. */
  seed: number;
  /** What shows through behind the bank: over the photo the misty back layer can be bright; over navy it stays faint. */
  over: 'photo' | 'navy';
}

/**
 * A cream cloud bank drawn across a section edge, so the cream sections read as layers of cloud instead of flat
 * bands. Two layers slide sideways at different speeds while scrolling; the solid base stays flush with the edge.
 * Needs a `relative` parent; height is BANK_HEIGHT.
 */
export function CloudBank({ edge, seed, over }: CloudBankProps) {
  const back = puffRow(seed * 31 + 7, 136, 30, 84);
  const front = puffRow(seed, 152, 24, 76);
  return (
    <div
      aria-hidden="true"
      className={clsx(
        'pointer-events-none absolute inset-x-0 z-[1] h-[clamp(110px,14vw,320px)] overflow-x-clip',
        edge === 'top' ? 'top-0 -scale-y-100' : 'bottom-0'
      )}
    >
      {/* Layers only slide sideways, so nothing ever lifts off the edge and shows a seam. */}
      <BankLayer
        layer="back"
        puffs={back}
        base={136}
        px={110}
        py={0}
        className={over === 'photo' ? 'opacity-70' : 'opacity-[0.16]'}
        shade={false}
      />
      <BankLayer layer="front" puffs={front} base={152} px={-50} py={0} shade={over === 'photo'} />
    </div>
  );
}

/** Height of a CloudBank, for sections that pad their content clear of it. */
export const BANK_HEIGHT = 'clamp(110px,14vw,320px)';
