'use client';

/** Minimal toast system: `const toast = useToast(); toast({ title, description, tone })`. */
import { CheckCircle2, Info, TriangleAlert, X, XCircle } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
}

interface ToastItem extends Required<Omit<ToastInput, 'description'>> {
  id: number;
  description?: string;
}

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

const TONE_STYLES: Record<ToastTone, { icon: typeof Info; className: string }> = {
  info: { icon: Info, className: 'text-accent' },
  success: { icon: CheckCircle2, className: 'text-success' },
  warning: { icon: TriangleAlert, className: 'text-warning' },
  error: { icon: XCircle, className: 'text-danger' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (input: ToastInput) => {
      const id = Date.now() + Math.random();
      setItems((list) => [...list.slice(-3), { id, title: input.title, description: input.description, tone: input.tone ?? 'info' }]);
      setTimeout(() => dismiss(id), input.tone === 'error' ? 7000 : 4500);
    },
    [dismiss]
  );

  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2"
        aria-live="polite"
      >
        {items.map((t) => {
          const { icon: Icon, className } = TONE_STYLES[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-panel p-3 shadow-panel"
            >
              <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-fg">{t.title}</p>
                {t.description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="rounded p-0.5 text-faint hover:text-fg"
                aria-label="Dismiss notification"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error('useToast must be used inside ToastProvider');
  return push;
}

/** Turns a SpacetimeDB reducer error into a readable message. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.replace(/^SenderError:\s*/, '');
  return String(err);
}
