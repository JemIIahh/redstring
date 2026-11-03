import { useRef, useState } from "react";

import { plainError } from "@/components/board/labels";

export interface Guard {
  busy: boolean;
  error: string | undefined;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}

/**
 * One save at a time: a second click while the first is still saving does nothing, even when it
 * lands before the button has been redrawn as disabled. A failure is kept as plain words.
 */
export function useGuarded(): Guard {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  async function run(fn: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(plainError(e, "That could not be saved. Try again."));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}
