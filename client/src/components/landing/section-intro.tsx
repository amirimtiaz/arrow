import clsx from 'clsx';
import type { ReactNode } from 'react';
import { DISPLAY, EYEBROW, SECTION_TITLE } from './styles';

interface SectionIntroProps {
  id: string;
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  /** `light` = ink text on cream; `dark` = cream text on navy. */
  tone: 'light' | 'dark';
  className?: string;
}

/** Eyebrow, display title and optional lede shared by every solid-color section. */
export function SectionIntro({ id, eyebrow, title, lede, tone, className }: SectionIntroProps) {
  const light = tone === 'light';

  return (
    <div className={clsx('max-w-3xl', className)}>
      <p className={clsx(EYEBROW, light ? 'text-[#1D5FBF]' : 'text-[#8CC2F5]')}>{eyebrow}</p>
      <h2 id={id} className={clsx(DISPLAY, SECTION_TITLE, 'mt-5')}>
        {title}
      </h2>
      {lede && <p className={clsx('mt-6 max-w-2xl text-lg/8', light ? 'text-[#0B1724]/75' : 'text-[#F5F1E8]/70')}>{lede}</p>}
    </div>
  );
}
