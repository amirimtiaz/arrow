'use client';

/** Small UI kit for the Control Tower: large hit targets, high contrast, plain labels. */
import { Loader2, X, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { TONE_CLASSES, type StatusMeta, type Tone } from './vocab';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-strong border border-transparent',
  secondary: 'bg-panel-2 text-fg hover:bg-panel-hover border border-line-strong',
  ghost: 'bg-transparent text-muted hover:text-fg hover:bg-panel-hover border border-transparent',
  danger: 'bg-danger text-white hover:opacity-90 border border-transparent',
  warning: 'bg-warning text-black hover:opacity-90 border border-transparent',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  busy?: boolean;
}

export function Button({ variant = 'secondary', size = 'md', icon: Icon, busy, className, children, disabled, ...rest }: ButtonProps) {
  const sizes = { sm: 'h-8 px-2.5 text-xs gap-1.5', md: 'h-10 px-3.5 text-sm gap-2', lg: 'h-12 px-5 text-base gap-2.5' };
  return (
    <button
      type="button"
      disabled={disabled || busy}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        sizes[size],
        VARIANTS[variant],
        className
      )}
      {...rest}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

/** Status pill: always color + icon + text. */
export function StatusBadge({ meta, size = 'md', className }: { meta: StatusMeta; size?: 'sm' | 'md'; className?: string }) {
  const tone = TONE_CLASSES[meta.tone];
  const Icon = meta.icon;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md border font-semibold whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs',
        tone.bg,
        tone.text,
        tone.border,
        className
      )}
      title={meta.hint}
    >
      <Icon className={size === 'sm' ? 'size-3' : 'size-3.5'} aria-hidden />
      {meta.label}
    </span>
  );
}

export function Pill({ tone = 'muted', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const t = TONE_CLASSES[tone];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold',
        t.bg,
        t.text,
        t.border,
        className
      )}
    >
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line-strong bg-panel-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted">
      {children}
    </kbd>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <Icon className="size-7 text-faint" aria-hidden />
      <p className="text-sm font-semibold text-fg">{title}</p>
      {children && <div className="max-w-sm text-xs leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function SectionTitle({ icon: Icon, children, right }: { icon?: LucideIcon; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-xs font-bold tracking-wider text-muted uppercase">
        {Icon && <Icon className="size-3.5" aria-hidden />}
        {children}
      </h3>
      {right}
    </div>
  );
}

export const inputClass =
  'w-full rounded-lg border border-line-strong bg-bg px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none';

/** Label wraps its single control, so the association needs no ids. */
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-snug text-faint">{hint}</span>}
    </label>
  );
}

export function Select({
  value,
  onChange,
  options,
  disabled,
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Record<string, string> | [string, string][];
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const entries = Array.isArray(options) ? options : Object.entries(options);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cx(inputClass, 'h-10 py-0 pr-8', className)}
    >
      {entries.map(([k, label]) => (
        <option key={k} value={k}>
          {label}
        </option>
      ))}
    </select>
  );
}

/** Accessible modal. Esc closes; the first input gets focus. */
export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  width = 'max-w-lg',
  tone,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  width?: string;
  tone?: Tone;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  // Mount only: focus the first field once and listen for Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    const root = panel.current;
    const first =
      root?.querySelector<HTMLElement>('[data-autofocus]') ??
      root?.querySelector<HTMLElement>('input, textarea, select') ??
      root?.querySelector<HTMLElement>('button[data-primary]');
    first?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/55 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-ir-modal
        onMouseDown={(e) => e.stopPropagation()}
        className={cx('w-full rounded-2xl border bg-panel shadow-panel', width, tone ? TONE_CLASSES[tone].border : 'border-line-strong')}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className={cx('text-lg font-bold', tone ? TONE_CLASSES[tone].text : 'text-fg')}>
              {title}
            </h2>
            {description && <div className="mt-1 text-sm leading-relaxed text-muted">{description}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-faint hover:bg-panel-hover hover:text-fg"
            aria-label="Close dialog"
          >
            <X className="size-5" />
          </button>
        </div>
        {children && <div className="max-h-[65vh] overflow-y-auto px-5 py-4 scroll-thin">{children}</div>}
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}
