'use client';

import { useEffect } from 'react';

/**
 * Drives the landing page's scroll motion; renders nothing.
 *
 * - Parallax: every `[data-scroll-scope]` section gets `--p`, its offset from the middle of the viewport in viewport
 *   heights (0 when centred, rising as you scroll past). `.parallax` children turn that into movement.
 * - Reveals: `[data-reveal]` elements (values: "", "left", "right", "zoom") fade in as they enter the viewport.
 *   Anything already on screen when this mounts is marked revealed first, so nothing visible blinks out.
 *
 * With prefers-reduced-motion nothing is armed and every element simply stays where it is.
 */
export function ScrollEffects() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = document.documentElement;

    const scopes = Array.from(document.querySelectorAll<HTMLElement>('[data-scroll-scope]'));
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;
      for (const el of scopes) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom < -vh || rect.top > 2 * vh) continue;
        const p = (vh / 2 - (rect.top + rect.height / 2)) / vh;
        el.style.setProperty('--p', p.toFixed(4));
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);

    const pending: Element[] = [];
    for (const el of document.querySelectorAll('[data-reveal]')) {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) el.setAttribute('data-revealed', '');
      else pending.push(el);
    }
    root.dataset.motion = 'on';
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-revealed', '');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px' }
    );
    for (const el of pending) observer.observe(el);

    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
      observer.disconnect();
      delete root.dataset.motion;
    };
  }, []);

  return null;
}
