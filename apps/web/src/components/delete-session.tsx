'use client';

import { useState } from 'react';

import { Button } from '@/components/ui';
import { deleteScenario } from '@/lib/actions';

/**
 * Delete, with a step in between.
 *
 * This sat one click away from Clone, on a row whose only distinguishing
 * feature is often a timestamp, two sessions can share a client's name, and
 * it destroys a scoping session containing a prospective client's whole asset
 * inventory. There is no undo, no trash, and nothing to re-import from.
 *
 * The confirmation is inline rather than a `window.confirm` or a modal. A
 * native confirm is a different visual language and is suppressible per-site;
 * a modal needs a portal and a focus trap for a single yes/no. Swapping the
 * button for "Delete? Yes / Cancel" in place costs one piece of state, keeps
 * the row's layout, and puts the decision where the pointer already is.
 *
 * The name is repeated in the prompt on purpose: the failure this guards
 * against is deleting the *wrong row*, not being unaware that delete deletes.
 */
export function DeleteSession({ id, name }: { id: string; name: string }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" variant="danger" onClick={() => setConfirming(true)}>
        Delete
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-bad max-w-[28ch] truncate text-xs" title={name}>
        Delete “{name}”?
      </span>
      <form action={deleteScenario}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="danger">
          Yes, delete
        </Button>
      </form>
      <Button type="button" variant="ghost" onClick={() => setConfirming(false)} autoFocus>
        Cancel
      </Button>
    </div>
  );
}
