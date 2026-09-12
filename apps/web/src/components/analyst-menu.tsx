'use client';

import { signOut } from 'next-auth/react';

/**
 * Who is signed in, and the way out.
 *
 * A shared tool with no visible identity is one where somebody eventually
 * edits a colleague's session believing it is their own, or leaves themselves
 * signed in on a machine in a client's meeting room. Showing the address costs
 * one line and answers both.
 *
 * Deliberately not a dropdown. There is exactly one action, and burying one
 * action behind a disclosure that needs a portal, a focus trap and an outside
 * click handler is how a component library gets added to a project that does
 * not need one.
 */
export function AnalystMenu({ email }: { email: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-faint hidden max-w-[22ch] truncate text-xs md:inline" title={email}>
        {email}
      </span>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: '/signin' })}
        className="border-line text-muted hover:text-ink hover:border-line-strong rounded border px-2 py-1 text-xs transition-colors duration-(--duration-quick)"
      >
        Sign out
      </button>
    </div>
  );
}
