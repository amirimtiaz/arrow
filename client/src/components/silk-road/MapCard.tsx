'use client';

/**
 * A card that floats over the Silk Road map and can be dragged anywhere inside it by its header (legend, crisis
 * scenarios, live news, risk monitor). Until it is moved it sits in its default corner; the dragged position and the
 * folded state are saved per browser (Settings). The card under the pointer comes to the front.
 */
import clsx from 'clsx';
import { ChevronDown, GripVertical, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useSettings } from '@/lib/settings';

const MARGIN = 12;
let topZ = 20;

export interface MapCardProps {
  id: string;
  title: string;
  icon: LucideIcon;
  iconClassName?: string;
  /** Card width in px. */
  width: number;
  /** Default corner before the card is dragged (px from the map edges). */
  anchor: { left?: number; right?: number; top?: number; bottom?: number };
  /** Extra header content, e.g. a count or badge. */
  badge?: ReactNode;
  /** Hide the card (turn it back on in Settings). */
  onClose?: () => void;
  closeTitle?: string;
  children: ReactNode;
}

export function MapCard({ id, title, icon: Icon, iconClassName, width, anchor, badge, onClose, closeTitle, children }: MapCardProps) {
  const { settings, setCardPosition, setCardCollapsed } = useSettings();
  const saved = settings.map.positions[id];
  const collapsed = !!settings.map.collapsed[id];
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [z, setZ] = useState(20);

  /** Keep the card fully inside the map. */
  const clamp = (x: number, y: number) => {
    const box = boxRef.current;
    const parent = box?.parentElement;
    if (!box || !parent) return { x, y };
    return {
      x: Math.min(Math.max(MARGIN, x), Math.max(MARGIN, parent.clientWidth - box.offsetWidth - MARGIN)),
      y: Math.min(Math.max(MARGIN, y), Math.max(MARGIN, parent.clientHeight - box.offsetHeight - MARGIN)),
    };
  };

  // Pull a moved card back inside when the map shrinks (window resize, Ask Arrow opening).
  useEffect(() => {
    const parent = boxRef.current?.parentElement;
    if (!parent || !saved) return;
    const observer = new ResizeObserver(() => {
      const next = clamp(saved.x, saved.y);
      if (next.x !== saved.x || next.y !== saved.y) setCardPosition(id, next);
    });
    observer.observe(parent);
    return () => observer.disconnect();
    // clamp only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, id, setCardPosition]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    setZ(++topZ);
    if ((e.target as HTMLElement).closest('button')) return;
    const box = boxRef.current;
    if (!box) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { dx: e.clientX - box.offsetLeft, dy: e.clientY - box.offsetTop };
    setDragPos({ x: box.offsetLeft, y: box.offsetTop });
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setDragPos(clamp(e.clientX - drag.current.dx, e.clientY - drag.current.dy));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    if (dragPos) setCardPosition(id, dragPos);
    setDragPos(null);
  };

  const pos = dragPos ?? saved;
  const placement: CSSProperties = pos ? { left: pos.x, top: pos.y } : { ...anchor };

  return (
    <div
      ref={boxRef}
      role="region"
      aria-label={title}
      onPointerDownCapture={() => setZ(++topZ)}
      className={clsx(
        'pointer-events-auto absolute flex max-h-[calc(100%-24px)] flex-col overflow-hidden rounded-xl border border-line bg-panel/95 shadow-panel backdrop-blur',
        dragPos && 'ring-2 ring-accent/40'
      )}
      style={{ ...placement, width, zIndex: z }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => setCardPosition(id, null)}
        className={clsx(
          'flex shrink-0 touch-none items-center gap-1.5 py-1.5 pr-1.5 pl-1 select-none',
          !collapsed && 'border-b border-line',
          dragPos ? 'cursor-grabbing' : 'cursor-grab'
        )}
        title="Drag to move. Double-click to put it back in its corner."
      >
        <GripVertical className="size-3.5 shrink-0 text-faint" aria-hidden />
        <Icon className={clsx('size-3.5 shrink-0', iconClassName ?? 'text-accent')} aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-xs font-bold text-fg">{title}</h2>
        {badge}
        <button
          type="button"
          onClick={() => setCardCollapsed(id, !collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
          title={collapsed ? 'Expand' : 'Collapse'}
          className="grid size-6 shrink-0 place-items-center rounded-md text-faint hover:bg-panel-hover hover:text-fg"
        >
          <ChevronDown className={clsx('size-3.5 transition-transform', collapsed && '-rotate-90')} aria-hidden />
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={`Hide ${title}`}
            title={closeTitle ?? 'Hide (turn it back on in Settings)'}
            className="grid size-6 shrink-0 place-items-center rounded-md text-faint hover:bg-panel-hover hover:text-fg"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
      {!collapsed && <div className="scroll-thin min-h-0 overflow-y-auto">{children}</div>}
    </div>
  );
}
