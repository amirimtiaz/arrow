'use client';

/** Incident tasks grouped by NIST phase. Owners (or the commander) tick them off. */
import { CheckCircle2, Circle, ListTodo, Plus } from 'lucide-react';
import type { Incident, IrTask } from '@/module_bindings/ir/types';
import { useIr } from '@/lib/ir/client';
import { useCt } from './context';
import { formatTime, tsMs } from './format';
import { Button, cx, EmptyState } from './ui';
import { PHASE_META, PHASES } from './vocab';

export function TaskRow({ task, incident }: { task: IrTask; incident: Incident }) {
  const { conn } = useIr();
  const { me, can, run } = useCt();
  const done = task.status === 'done';
  const myHex = me.identity.toHexString();
  const leads = me.role === 'admin' || me.role === 'incident_commander';
  const allowed =
    !done && incident.status !== 'closed' && can('complete_task') && (leads || !task.assigneeHex || task.assigneeHex === myHex);

  return (
    <li className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-panel-hover/60">
      <button
        type="button"
        disabled={!allowed}
        onClick={() => conn && run(() => conn.reducers.completeTask({ taskId: task.id, note: '' }), `Done: ${task.title}`)}
        className={cx('mt-0.5 shrink-0 rounded-full', allowed ? 'text-muted hover:text-success' : 'cursor-default')}
        aria-label={done ? `${task.title} is done` : allowed ? `Mark “${task.title}” done` : `${task.title} (open)`}
      >
        {done ? <CheckCircle2 className="size-5 text-success" /> : <Circle className="size-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cx('text-sm', done ? 'text-muted line-through' : 'text-fg')}>{task.title}</p>
        <p className="text-[11px] text-faint">
          {task.assigneeName ? `Owner: ${task.assigneeName}` : 'Unassigned'}
          {done && task.completedAt ? ` · done by ${task.completedByName} at ${formatTime(tsMs(task.completedAt))}` : ''}
        </p>
      </div>
    </li>
  );
}

export function TaskList({ incident, tasks }: { incident: Incident; tasks: IrTask[] }) {
  const { can, openDialog } = useCt();
  const canAdd = can('manage_tasks') && incident.status !== 'closed';
  const groups = PHASES.filter((p) => p !== 'preparation').map((phase) => ({
    phase,
    items: tasks.filter((t) => t.phase === phase).sort((a, b) => Number(a.id - b.id)),
  }));

  return (
    <section aria-label="Tasks">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted">
          {tasks.filter((t) => t.status === 'open').length} open · {tasks.filter((t) => t.status === 'done').length} done
        </p>
        {canAdd && (
          <Button size="sm" icon={Plus} onClick={() => openDialog({ kind: 'task' })}>
            Assign task
          </Button>
        )}
      </div>
      {tasks.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="No tasks yet"
          action={
            canAdd ? (
              <Button variant="secondary" icon={Plus} onClick={() => openDialog({ kind: 'task' })}>
                Assign task
              </Button>
            ) : undefined
          }
        >
          Break the response into owned steps so nothing falls through between shifts.
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {groups
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <div key={g.phase}>
                <h4 className={cx('mb-1 text-xs font-bold', g.phase === incident.phase ? 'text-accent' : 'text-muted')}>
                  {PHASE_META[g.phase].label}
                  {g.phase === incident.phase ? ' · current phase' : ''}
                </h4>
                <ul className="grid gap-0.5">
                  {g.items.map((t) => (
                    <TaskRow key={String(t.id)} task={t} incident={incident} />
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
