import { useEffect, useState } from 'react';

/**
 * Returns the current `Date` and re-renders the caller every `intervalMs`.
 * Use a 1-minute interval for "elapsed" labels; a 1-second interval when
 * showing a live ticking clock (e.g. the HH:MM:SS in the fasting ring).
 *
 * One hook per component is enough — sharing it across siblings would
 * require lifting it into a context, but the rerender cost is negligible.
 */
export function useNow(intervalMs: number = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
