export function stripExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(0, idx) : name;
}

export function changeExt(name: string, newExt: string, suffix: string = ""): string {
  return `${stripExt(name)}${suffix}.${newExt}`;
}

export function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function encode(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text);
}

/**
 * Watches a task that reports what it is doing, and tells whether it went quiet.
 * @param run The task.
 * @param onActivity Subscribes to the task's signs of life and returns how to unsubscribe.
 * @param ms How long the task may stay silent.
 * @returns `true` once nothing was heard for `ms` while the task was pending, `false` when
 * the task ended first, whichever way.
 */
export function stalls(
  run: Promise<unknown>,
  onActivity: (alive: () => void) => () => void,
  ms: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout>;
    const settle = (stalled: boolean) => {
      clearTimeout(timer);
      unsubscribe();
      resolve(stalled);
    };
    const alive = () => {
      clearTimeout(timer);
      timer = setTimeout(() => settle(true), ms);
    };
    const unsubscribe = onActivity(alive);
    alive();
    run.then(
      () => settle(false),
      () => settle(false),
    );
  });
}
