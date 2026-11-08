'use client';

/** "/" command palette: every action by name, so nobody has to remember where a button lives. */
import { Command, CornerDownLeft, Search } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { cx, Kbd } from './ui';

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
}

export function CommandPalette({ commands, onClose }: { commands: PaletteCommand[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.label} ${c.hint ?? ''} ${c.group}`.toLowerCase().includes(q));
  }, [commands, query]);
  const index = Math.min(active, Math.max(0, filtered.length - 1));

  function execute(cmd: PaletteCommand | undefined) {
    if (!cmd) return;
    onClose();
    cmd.run();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((index + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((index - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      execute(filtered[index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center bg-black/55 p-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        data-ir-modal
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-panel"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-5 text-faint" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Type a command… e.g. note, escalate, invite, verify"
            aria-label="Search commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="ir-palette-list"
            className="h-14 flex-1 bg-transparent text-base text-fg placeholder:text-faint focus:outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul id="ir-palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2 scroll-thin">
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No matching command.</li>}
          {filtered.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === index}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => execute(c)}
                className={cx(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left',
                  i === index ? 'bg-accent-soft text-fg' : 'text-muted hover:bg-panel-hover'
                )}
              >
                <Command className="size-4 shrink-0 text-faint" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-fg">{c.label}</span>
                  {c.hint && <span className="block truncate text-xs text-muted">{c.hint}</span>}
                </span>
                <span className="text-[11px] text-faint">{c.group}</span>
                {i === index && <CornerDownLeft className="size-4 text-faint" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
