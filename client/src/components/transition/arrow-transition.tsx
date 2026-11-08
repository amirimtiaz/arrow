'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { HalfArrow } from '@/components/brand/half-arrow';

/**
 * "Arrow shot" page transition between the landing page and the app.
 *
 * Clicking an <ArrowShotLink> launches the half arrow inside it. The arrow nocks back and shoots ahead, and the
 * camera pans after it: the current page slides out under a brand-blue transit screen, then the next page slides in
 * while the arrow flies across it and off the far edge. 'forward' travels right (landing → app). 'back' turns the
 * arrow around and travels left (app → landing).
 *
 * Pages opt in by marking their root element with `data-arrow-stage`; that element is what gets panned. The overlay
 * is mounted in the root layout so it survives the route change. Under prefers-reduced-motion, links navigate
 * immediately.
 */

export type ShotDirection = 'forward' | 'back';

interface ShotRequest {
  href: string;
  direction: ShotDirection;
  caption: string;
  source: Element | null;
}

const ShotContext = createContext<((shot: ShotRequest) => void) | null>(null);

/** Flight arrow size at full scale, in px. */
const ARROW_PX = 96;
/** Stop waiting for the next page after this long and reveal whatever has rendered. */
const ARRIVAL_TIMEOUT_MS = 10_000;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const phase = (t: number, start: number, duration: number) => clamp((t - start) / duration, 0, 1);

/** Calls `frame(elapsedMs)` on every animation frame until it returns true. */
function playFrames(frame: (elapsed: number) => boolean): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (now: number) => {
      if (frame(now - start)) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const afterNextPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/** The page root that is currently rendered (skips any hidden, preserved route). */
const visibleStage = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-arrow-stage]')).find((el) => el.getClientRects().length > 0) ?? null;

/** The logo's banner gradient, with one lighter diagonal band. */
const TRANSIT_SKY = [
  'linear-gradient(115deg, transparent 0 46%, rgba(255,255,255,0.05) 46% 64%, transparent 64%)',
  'linear-gradient(115deg, #001a52 0%, #003a9e 38%, #0563d8 68%, #0a9bff 100%)',
].join(', ');

/** Speed lines on the transit screen: [top %, width px, duration ms, delay ms, opacity]. */
const STREAKS: [number, number, number, number, number][] = [
  [7, 260, 640, -80, 0.32],
  [13, 140, 520, -300, 0.2],
  [21, 320, 760, -460, 0.38],
  [28, 180, 560, -120, 0.18],
  [35, 240, 700, -560, 0.3],
  [41, 120, 480, -240, 0.22],
  [57, 300, 720, -380, 0.36],
  [63, 160, 540, -60, 0.2],
  [70, 280, 680, -520, 0.3],
  [76, 130, 500, -200, 0.16],
  [83, 340, 820, -640, 0.34],
  [89, 200, 600, -340, 0.22],
  [95, 150, 560, -90, 0.18],
];

export function ArrowTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const busy = useRef(false);
  const arrival = useRef<{ path: string; resolve: () => void } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLParagraphElement>(null);
  const flyerRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLSpanElement>(null);

  // The next page has committed once the pathname matches the shot's target.
  useEffect(() => {
    const pending = arrival.current;
    if (pending && pending.path === pathname) {
      arrival.current = null;
      pending.resolve();
    }
  }, [pathname]);

  const shoot = useCallback(
    async ({ href, direction, caption, source }: ShotRequest) => {
      if (busy.current) return;
      const overlay = overlayRef.current;
      const panel = panelRef.current;
      const sky = skyRef.current;
      const label = captionRef.current;
      const flyer = flyerRef.current;
      const trail = trailRef.current;
      const target = new URL(href, window.location.href).pathname;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!overlay || !panel || !sky || !label || !flyer || !trail || reduceMotion || target === window.location.pathname) {
        router.push(href);
        return;
      }
      busy.current = true;

      const dir = direction === 'forward' ? 1 : -1;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const root = document.documentElement;
      const savedOverflowX = root.style.overflowX;
      const glyph = source instanceof HTMLElement || source instanceof SVGElement ? source : null;
      const box = glyph?.getBoundingClientRect();
      const oldStage = visibleStage();
      let newStage: HTMLElement | null = null;

      // Motion is computed in a forward frame (travel to the right); `screenX` mirrors it for 'back'.
      const screenX = (x: number) => (dir > 0 ? x : W - x);
      const x0 = box ? screenX(box.left + box.width / 2) : W * 0.85;
      const y0 = box ? box.top + box.height / 2 : H * 0.1;
      const s0 = box ? Math.max(box.width, 10) / ARROW_PX : 0.2;
      const xMid = W * 0.5;
      const yMid = H * 0.5;
      const xPeak = Math.max(x0 + 12, Math.min(x0 + 60, W - 40));
      const tNock = dir > 0 ? 110 : 220; // 'back' also turns the arrow around
      const tPeak = tNock + 130;
      const tPan = tNock - 30;
      const panMs = 540;
      const tMid = tPan + panMs;

      // Heading and trail come from the arrow's motion through the world (screen position + camera offset).
      let prevWorldX = x0;
      let prevY = y0;
      let prevT = 0;
      let angle = 0;
      let trailPx = 0;
      const place = (t: number, x: number, y: number, scale: number, flipDeg: number, cameraPx: number, cruising = false) => {
        const dt = Math.max(t - prevT, 1);
        const vx = (x + cameraPx - prevWorldX) / dt;
        const vy = (y - prevY) / dt;
        prevWorldX = x + cameraPx;
        prevY = y;
        prevT = t;
        const heading = vx > 0.02 ? clamp((Math.atan2(vy, vx) * 180) / Math.PI, -22, 22) : 0;
        angle = lerp(angle, heading, 0.3);
        trailPx = lerp(trailPx, cruising ? 170 : Math.min(Math.hypot(vx, vy) * 150, W * 0.35), 0.3);
        flyer.style.transform =
          `translate3d(${screenX(x) - ARROW_PX / 2}px, ${y - ARROW_PX / 2}px, 0) scaleX(${dir}) ` +
          `rotate(${angle}deg) perspective(400px) rotateY(${flipDeg}deg) scale(${scale})`;
        trail.style.width = `${trailPx / scale}px`;
      };
      const pan = (el: HTMLElement | null, px: number) => {
        if (el) el.style.transform = `translate3d(${px}px, 0, 0)`;
      };

      try {
        root.style.overflowX = 'hidden';
        sky.style.transform = dir > 0 ? '' : 'scaleX(-1)';
        label.textContent = caption;
        label.style.opacity = '0';
        flyer.style.color = glyph ? getComputedStyle(glyph).color : '#ffffff';
        panel.style.boxShadow = `${-dir * 40}px 0 90px rgba(2, 12, 34, 0.5)`;
        pan(panel, dir * W);
        if (oldStage) oldStage.style.willChange = 'transform';
        place(0, x0, y0, s0, dir > 0 ? 0 : 180, 0);
        overlay.style.display = 'block';
        if (glyph) glyph.style.visibility = 'hidden';

        // 1. Nock, shoot, and pan after the arrow until the transit screen fills the view.
        await playFrames((t) => {
          if (t > tNock * 0.6) flyer.style.color = '#ffffff';
          const camera = easeInOut(phase(t, tPan, panMs));
          pan(oldStage, -dir * camera * W);
          pan(panel, dir * (1 - camera) * W);
          const x =
            t < tNock
              ? x0 - 9 * easeOut(t / tNock)
              : t < tPeak
                ? lerp(x0 - 9, xPeak, easeOut(phase(t, tNock, tPeak - tNock)))
                : lerp(xPeak, xMid, easeInOut(phase(t, tPeak, tMid - tPeak)));
          const y = lerp(y0, yMid, easeInOut(phase(t, tNock, tMid - tNock)));
          const scale = lerp(s0, 1, easeOut(phase(t, tNock, 420)));
          const flip = dir > 0 ? 0 : 180 * (1 - easeInOut(phase(t, 0, tNock - 20)));
          place(t, x, y, scale, flip, camera * W);
          return t >= tMid;
        });

        // 2. Cruise while the next page loads and paints.
        let arrived = false;
        void new Promise<void>((resolve) => {
          arrival.current = { path: target, resolve };
        })
          .then(afterNextPaint)
          .then(() => {
            arrived = true;
          });
        router.push(href);
        const holdStart = prevT;
        await playFrames((t) => {
          if (t > 280) label.style.opacity = '1';
          place(holdStart + t, xMid, yMid + Math.sin(t / 170) * 3, 1, 0, W, true);
          return (arrived && t >= 60) || t >= ARRIVAL_TIMEOUT_MS;
        });

        // 3. Keep panning into the next page; the arrow flies across it and off the far edge.
        arrival.current = null;
        label.style.opacity = '0';
        newStage = visibleStage();
        if (newStage) newStage.style.willChange = 'transform';
        pan(newStage, dir * W);
        panel.style.boxShadow = `${dir * 40}px 0 90px rgba(2, 12, 34, 0.5)`;
        const revealStart = prevT;
        const revealMs = 540;
        await playFrames((t) => {
          const camera = easeInOut(phase(t, 0, revealMs));
          pan(panel, -dir * camera * W);
          pan(newStage, dir * (1 - camera) * W);
          const exit = easeIn(phase(t, 160, 420));
          place(revealStart + t, lerp(xMid, W + ARROW_PX * 2, exit), yMid - 18 * exit, 1, 0, W + camera * W);
          return t >= 580;
        });
      } finally {
        for (const el of [oldStage, newStage]) {
          if (el) {
            el.style.transform = '';
            el.style.willChange = '';
          }
        }
        overlay.style.display = '';
        root.style.overflowX = savedOverflowX;
        if (glyph?.isConnected) glyph.style.visibility = '';
        arrival.current = null;
        busy.current = false;
      }

      // The arrow at the destination answers with a small pop.
      const landedOn = newStage?.querySelector<SVGElement>('[data-arrow-glyph]');
      if (landedOn) {
        landedOn.style.transformOrigin = 'center';
        landedOn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }], {
          duration: 420,
          easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        });
      }
    },
    [router]
  );

  return (
    <ShotContext.Provider value={shoot}>
      {children}
      <div ref={overlayRef} className="fixed inset-0 z-[1000] hidden cursor-wait overflow-hidden">
        <div ref={panelRef} className="absolute inset-0 overflow-hidden">
          <div ref={skyRef} aria-hidden="true" className="absolute inset-0" style={{ background: TRANSIT_SKY }}>
            {STREAKS.map(([top, width, duration, delay, opacity]) => (
              <span
                key={top}
                className="absolute left-0 h-[2px] rounded-full"
                style={{
                  top: `${top}%`,
                  width,
                  opacity,
                  background: 'linear-gradient(90deg, #ffffff, rgba(255,255,255,0))',
                  animation: `arrow-streak ${duration}ms linear ${delay}ms infinite`,
                }}
              />
            ))}
          </div>
          <p
            ref={captionRef}
            role="status"
            className="absolute inset-x-0 top-[calc(50%+76px)] text-center text-xs font-semibold tracking-[0.28em] text-white/85 uppercase opacity-0 transition-opacity duration-300"
          />
        </div>
        <div
          ref={flyerRef}
          aria-hidden="true"
          className="absolute top-0 left-0 transition-[color] duration-200"
          style={{ width: ARROW_PX, height: ARROW_PX, filter: 'drop-shadow(0 0 14px rgba(150, 205, 255, 0.9))' }}
        >
          <span
            ref={trailRef}
            className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full"
            style={{
              right: `calc(100% - ${ARROW_PX * 0.08}px)`,
              background: 'linear-gradient(270deg, rgba(255,255,255,0.9), rgba(255,255,255,0))',
            }}
          />
          <HalfArrow className="relative size-full" />
        </div>
      </div>
    </ShotContext.Provider>
  );
}

type ArrowShotLinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'onNavigate' | 'ref'> & {
  href: string;
  direction: ShotDirection;
  /** Shown on the transit screen if the next page takes a moment to load. */
  caption: string;
};

/**
 * A Link whose half arrow ([data-arrow-glyph]) shoots to the destination. Modifier-clicks still open a new tab
 * because Next.js only calls `onNavigate` for in-app navigations.
 */
export function ArrowShotLink({ href, direction, caption, children, ...rest }: ArrowShotLinkProps) {
  const shoot = useContext(ShotContext);
  const router = useRouter();
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    router.prefetch(href);
  }, [router, href]);

  return (
    <Link
      {...rest}
      ref={linkRef}
      href={href}
      onNavigate={(event) => {
        if (!shoot) return;
        event.preventDefault();
        shoot({ href, direction, caption, source: linkRef.current?.querySelector('[data-arrow-glyph]') ?? null });
      }}
    >
      {children}
    </Link>
  );
}
