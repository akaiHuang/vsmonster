/**
 * Debounce & throttle utilities.
 *
 * Used to reduce the frequency of expensive operations such as:
 *  - JSON file writes (task-database.save / media-database.save)
 *  - WebSocket broadcast storms when many task updates fire in quick succession
 */

/**
 * Classic trailing-edge debounce.
 * The wrapped function will only execute after `ms` milliseconds of inactivity.
 */
export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T & { flush(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: any[] | null = null;

  const debounced = ((...args: any[]) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      lastArgs = null;
      fn(...args);
    }, ms);
  }) as T & { flush(): void };

  /** Force immediate execution of the pending call (if any). */
  debounced.flush = () => {
    if (timer && lastArgs) {
      clearTimeout(timer);
      timer = null;
      const args = lastArgs;
      lastArgs = null;
      fn(...args);
    }
  };

  return debounced;
}

/**
 * Leading-edge throttle.
 * The wrapped function executes immediately on first call, then ignores
 * subsequent calls until `ms` milliseconds have elapsed.
 */
export function throttle<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let lastCall = 0;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - lastCall >= ms) {
      lastCall = now;
      fn(...args);
    }
  }) as T;
}
