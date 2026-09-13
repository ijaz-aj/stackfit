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
    /*
      Quiet until it is wanted.

      `danger` put a red-bordered button on every row of the session list,
      twelve of them down one edge, which is a wall of alarm around the action
      an analyst wants least often. Colour is how an interface says "be
      careful", and spending it on a resting state leaves nothing to spend when
      the decision is actually in front of someone.

      Not hidden until hover, though: hover is not an interaction a keyboard or
      a touchscreen has, and a destructive action nobody can reach is its own
      kind of broken. It is present, legible and unremarkable, and it turns red
      the moment the pointer is on it.
    */
    return (
      <Button
        type="button"
        variant="ghost"
        onClick={() => setConfirming(true)}
        className="hover:text-bad hover:bg-bad/10 px-2 py-1 text-xs"
      >
        Delete
      </Button>
    );
  }

  /*
    Wraps, because it has to.

    Measured at 390px: the confirmation is ~435px of content, and it used to
    sit in a `shrink-0` container that could neither shrink nor wrap. The row
    is ~308px, so the page's scrollWidth went from 390 to 575 the instant
    somebody tapped Delete: "Yes, delete" and "Cancel" left the screen
    sideways, on the one interaction where the two choices must both be
    reachable. `min-w-0` lets the name give up its width first, and the buttons
    drop to a second line before anything leaves the viewport.
  */
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
      <span className="text-bad min-w-0 max-w-[28ch] truncate text-xs" title={name}>
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
