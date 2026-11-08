'use client';

/** Small shared UI primitives (buttons, chips, panels, dropdowns). */
import clsx from 'clsx';
import { Loader2, type LucideIcon } from 'lucide-react';
import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import type { StatusMeta } from '@/lib/ops/status';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-strong border-transparent',
  secondary: 'bg-panel text-fg border-line hover:bg-panel-hover',
  ghost: 'bg-transparent text-muted border-transparent hover:bg-panel-hover hover:text-fg',
  danger: 'bg-danger text-white border-transparent hover:opacity-90',
  success: 'bg-success text-white border-transparent hover:opacity-90',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, loading, className, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'h-7 px-2.5 text-xs',
        size === 'md' && 'h-9 px-3.5 text-sm',
        size === 'lg' && 'h-11 px-5 text-sm',
        BUTTON_VARIANTS[variant],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon && <Icon className="size-4" aria-hidden />}
      {children}
    </button>
  );
});

export function Panel({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('rounded-xl border border-line bg-panel shadow-panel', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionLabel({ icon: Icon, children, right }: { icon?: LucideIcon; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-1.5 text-[11px] font-bold tracking-[0.08em] text-muted uppercase">
        {Icon ? <Icon className="size-3.5 text-accent" aria-hidden /> : <span className="size-1.5 rounded-full bg-accent" />}
        {children}
      </h2>
      {right}
    </div>
  );
}

/** Status pill: always color + icon + text. */
export function StatusChip({ meta, label, className }: { meta: StatusMeta; label?: string; className?: string }) {
  const Icon = meta.icon;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase',
        meta.text,
        meta.soft,
        className
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label ?? meta.label}
    </span>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wide uppercase',
        className ?? 'border-line text-muted'
      )}
    >
      {children}
    </span>
  );
}

export function ProgressBar({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'success' | 'warning' | 'danger' }) {
  const color = { accent: 'bg-accent', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' }[tone];
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-panel-2"
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={clsx('h-full rounded-full transition-[width] duration-700', color)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-panel-2 text-faint">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-semibold text-fg">{title}</p>
      {children && <div className="max-w-xs text-xs leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

/** Dropdown anchored to a trigger; closes on outside click or Escape. */
export function Dropdown({
  trigger,
  children,
  align = 'right',
  width = 'w-64',
}: {
  trigger: (props: { open: boolean; toggle(): void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={clsx(
            'absolute top-full z-50 mt-2 rounded-xl border border-line bg-panel p-1.5 shadow-panel',
            align === 'right' ? 'right-0' : 'left-0',
            width
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** Modal dialog with focus on open and Escape to close. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  width = 'max-w-lg',
  dismissible = true,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  width?: string;
  dismissible?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Callers often pass a new onClose every render; keep the latest in a ref so typing in the dialog never re-runs
  // the open effect (which used to pull focus out of the input after every keystroke).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus once when the dialog opens: the field marked autoFocus if there is one, else the panel.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel || panel.contains(document.activeElement)) return; // React's autoFocus already put focus inside
    (panel.querySelector<HTMLElement>('[data-autofocus]') ?? panel).focus();
  }, [open]);

  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, dismissible]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
      onMouseDown={dismissible ? onClose : undefined}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={clsx('w-full rounded-2xl border border-line bg-panel p-6 shadow-panel outline-none', width)}
      >
        <h2 className="text-lg font-bold text-fg">{title}</h2>
        {description && <div className="mt-1 text-sm leading-relaxed text-muted">{description}</div>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
