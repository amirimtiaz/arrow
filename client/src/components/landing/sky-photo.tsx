import clsx from 'clsx';
import Image from 'next/image';
import type { CSSProperties } from 'react';

/** Bundled locally (see public/images/CREDITS.md); never hotlinked. The original photo with its clouds painted out. */
const PHOTO_SRC = '/images/hero-sky-clear.jpg';

/** Multiplies a blue wash into the upper frame so the sky reads saturated without recoloring the people. */
const SKY_TINT: CSSProperties = {
  backgroundImage: 'linear-gradient(180deg, rgba(20,104,224,0.55) 0%, rgba(20,104,224,0.26) 38%, rgba(20,104,224,0) 62%)',
  mixBlendMode: 'multiply',
};

interface SkyPhotoProps {
  /** Describe the photo where it carries meaning; pass '' where it repeats as decoration. */
  alt: string;
  /** Tailwind `object-[x_y]` classes choosing the crop (the photo is wider than the viewport). */
  positionClassName: string;
  /** CSS background-image layers drawn over the photo for text contrast. */
  scrim: string;
  preload?: boolean;
  mirrored?: boolean;
}

/**
 * Full-bleed background photo for a `relative isolate overflow-hidden` parent. The frame is at least 84vw
 * tall, so on wide screens the people sit in the lower half and the sky above holds the headline.
 */
export function SkyPhoto({ alt, positionClassName, scrim, preload = false, mirrored = false }: SkyPhotoProps) {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[max(100%,84vw)]">
        <Image
          src={PHOTO_SRC}
          alt={alt}
          fill
          preload={preload}
          sizes="(max-width: 767px) 330vw, 130vw"
          className={clsx('object-cover', positionClassName, mirrored && '-scale-x-100')}
        />
      </div>
      <div className="absolute inset-0" style={SKY_TINT} />
      <div className="absolute inset-0" style={{ backgroundImage: scrim }} />
    </div>
  );
}
