'use client';

/**
 * Pages render their title and actions into the shared top bar through
 * portals: <TopBarTitle>…</TopBarTitle> and <TopBarActions>…</TopBarActions>.
 */
import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Slots {
  title: HTMLElement | null;
  actions: HTMLElement | null;
  setTitle(el: HTMLElement | null): void;
  setActions(el: HTMLElement | null): void;
}

const SlotsContext = createContext<Slots | null>(null);

export function TopBarSlotsProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<HTMLElement | null>(null);
  const [actions, setActions] = useState<HTMLElement | null>(null);
  return <SlotsContext.Provider value={{ title, actions, setTitle, setActions }}>{children}</SlotsContext.Provider>;
}

function useSlots() {
  const slots = useContext(SlotsContext);
  if (!slots) throw new Error('TopBar slots require TopBarSlotsProvider');
  return slots;
}

export function TopBarTitleTarget({ className }: { className?: string }) {
  const { setTitle } = useSlots();
  return <div ref={setTitle} className={className} />;
}

export function TopBarActionsTarget({ className }: { className?: string }) {
  const { setActions } = useSlots();
  return <div ref={setActions} className={className} />;
}

export function TopBarTitle({ children }: { children: ReactNode }) {
  const { title } = useSlots();
  return title ? createPortal(children, title) : null;
}

export function TopBarActions({ children }: { children: ReactNode }) {
  const { actions } = useSlots();
  return actions ? createPortal(children, actions) : null;
}
