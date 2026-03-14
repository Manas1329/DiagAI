import { useState, useCallback } from 'react';

export interface HistoryEntry<T> {
  state: T;
}

const MAX_HISTORY = 50;

export function useHistory<T>(initial: T) {
  const [stack, setStack] = useState<T[]>([initial]);
  const [idx, setIdx]     = useState(0);

  const push = useCallback((state: T) => {
    setStack((prev) => {
      const next = prev.slice(0, idx + 1);
      next.push(state);
      if (next.length > MAX_HISTORY) next.shift();
      return next;
    });
    setIdx((prev) => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [idx]);

  const undo = useCallback(() => setIdx((prev) => Math.max(prev - 1, 0)), []);
  const redo = useCallback(
    () => setIdx((prev) => Math.min(prev + 1, stack.length - 1)),
    [stack.length]
  );

  return {
    present:  stack[idx],
    push,
    undo,
    redo,
    canUndo:  idx > 0,
    canRedo:  idx < stack.length - 1,
  };
}

export default useHistory;
