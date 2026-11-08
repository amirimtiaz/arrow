/*
 * Shared class strings for the marketing page. The landing page is photo-led and uses a fixed palette
 * (cream, ink, navy, sky) so it looks identical in the app's light and dark themes.
 *
 *   cream  #F5F1E8   ink  #0B1724   navy  #08131F   navy card  #0E1C2B
 *   sky accent on navy  #8CC2F5      blue accent on cream  #1D5FBF
 */

/** Centered content column for the solid-color sections. */
export const CONTAINER = 'mx-auto w-full max-w-[1360px] px-6 sm:px-10 lg:px-14';

/** Full-bleed gutter for content laid over the photo (nav, hero, closing). */
export const GUTTER = 'px-6 sm:px-10 lg:px-[6vw]';

/** Small uppercase label above section titles. */
export const EYEBROW = 'font-mono text-xs font-medium uppercase tracking-[0.2em]';

/** Condensed display type (Anton), used for every large headline. */
export const DISPLAY = 'font-display font-normal uppercase leading-[0.9]';

/** Section title size: large, but smaller than the hero. */
export const SECTION_TITLE = 'text-[length:clamp(2.75rem,5.2vw,5.5rem)]';
