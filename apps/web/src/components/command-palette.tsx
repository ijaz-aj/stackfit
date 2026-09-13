'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { searchSessions, type CommandTarget } from '@/lib/actions';
import { cn } from '@/lib/cn';

/**
 * Ctrl-K, and everything reachable from it.
 *
 * An analyst on a call has one screen and no time. Before this, reaching a
 * different client meant going back to the sessions list, finding a row among
 * twelve that share a name, and clicking it: three deliberate actions and a
 * page load, in front of the person who just asked the question.
 *
 * The shortcut is the one every tool this audience already uses has bound to
 * exactly this, so it needs no teaching, and the header carries a visible
 * affordance for the people who never learn a shortcut.
 *
 * Sessions come from a server action rather than being shipped with the page.
 * The layout wraps the sign-in screen too, and a prospective client list baked
 * into every response is a list anyone who can load the login page can read.
 */

interface Command {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly run: () => void;
}

const SHORTCUT_HINT =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sessions, setSessions] = useState<readonly CommandTarget[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((was) => !was);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Fetch on open and on every keystroke. The action is a database read of at
  // most fifty rows; debouncing it would add latency to the common case, which
  // is a three-letter query that already matches.
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    void searchSessions(query).then((found) => {
      if (live) setSessions(found);
    });
    return () => {
      live = false;
    };
  }, [open, query]);

  useEffect(() => {
    if (open) {
      setActive(0);
      inputRef.current?.focus();
    } else {
      setQuery('');
    }
  }, [open]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const matches = (text: string) =>
    query.trim() === '' || text.toLowerCase().includes(query.trim().toLowerCase());

  const commands: Command[] = [
    ...sessions.map((session) => ({
      id: `session:${session.id}`,
      label: session.name,
      detail: session.detail,
      run: () => go(`/scenarios/${session.id}`),
    })),
    ...sessions.slice(0, 3).map((session) => ({
      id: `results:${session.id}`,
      label: `${session.name}: results`,
      detail: 'Open the dashboard',
      run: () => go(`/scenarios/${session.id}/results`),
    })),
    /*
     * The proposal, which the palette offered no route to at all. Neither did
     * anything else in the application: the document this product exists to
     * produce could only be reached by typing its URL.
     */
    ...sessions.slice(0, 3).map((session) => ({
      id: `proposal:${session.id}`,
      label: `${session.name}: proposal`,
      detail: 'Preview, then download as Word, PDF or spreadsheet',
      run: () => go(`/scenarios/${session.id}/proposal`),
    })),
    ...[
      { id: 'nav:home', label: 'All scoping scenarios', detail: 'Go to the list', href: '/' },
      {
        id: 'nav:compare',
        label: 'Compare two scenarios',
        detail: 'Side by side',
        href: '/compare',
      },
    ]
      .filter((entry) => matches(entry.label) || matches(entry.detail))
      .map((entry) => ({
        id: entry.id,
        label: entry.label,
        detail: entry.detail,
        run: () => go(entry.href),
      })),
  ];

  const onInputKey = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(commands.length - 1, index + 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      commands[active]?.run();
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-keyshortcuts="Control+K Meta+K"
        className="border-line text-faint hover:border-line-control hover:text-muted hidden items-center gap-2 rounded-(--radius-control) border px-2.5 py-1 text-xs transition-colors sm:inline-flex"
      >
        Search
        <kbd className="border-line bg-panel-raised rounded border px-1 py-px text-2xs">
          {SHORTCUT_HINT}
        </kbd>
      </button>
    );
  }

  return (
    <>
      {/* Click-away, and the dimming that says the page behind is inert. */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search scenarios and actions"
        className="fixed inset-x-0 top-[12vh] z-50 mx-auto w-[min(620px,92vw)]"
      >
        <div className="surface overflow-hidden shadow-(--shadow-lifted)">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKey}
            placeholder="Find a client, or jump somewhere"
            aria-label="Search scenarios and actions"
            className="border-line text-ink placeholder:text-faint w-full border-b bg-transparent px-4 py-3.5 text-base outline-none"
          />

          {commands.length === 0 ? (
            <p className="text-faint px-4 py-6 text-sm">Nothing matches “{query}”.</p>
          ) : (
            <ul className="max-h-[52vh] overflow-y-auto py-1">
              {commands.map((command, index) => (
                <li key={command.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onClick={command.run}
                    className={cn(
                      'flex w-full items-baseline gap-3 px-4 py-2 text-left transition-colors',
                      index === active ? 'bg-accent/10 text-ink' : 'text-muted',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{command.label}</span>
                    <span className="text-faint shrink-0 text-xs">{command.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-line text-faint flex items-center gap-4 border-t px-4 py-2 text-2xs">
            <span>↑↓ to move</span>
            <span>↵ to open</span>
            <span>esc to close</span>
          </div>
        </div>
      </div>
    </>
  );
}
