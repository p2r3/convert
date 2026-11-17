/** A binary min-heap: {@link poll} returns the item the comparator ranks lowest. */
class PriorityQueue<T> {
  private _queue: T[] = [];
  private _comparator: (a: T, b: T) => number;

  constructor(comparator: (a: T, b: T) => number) {
    this._comparator = comparator;
  }

  public add(item: T): void {
    const queue = this._queue;
    let k = queue.push(item) - 1;
    while (k > 0) {
      const parent = (k - 1) >>> 1;
      if (this._comparator(item, queue[parent]) >= 0) break;
      queue[k] = queue[parent];
      k = parent;
    }
    queue[k] = item;
  }

  public poll(): T | undefined {
    const queue = this._queue;
    if (queue.length <= 1) return queue.pop();
    const result = queue[0];
    const item = queue.pop()!;
    const size = queue.length;
    let k = 0;
    while (true) {
      let child = 2 * k + 1;
      if (child >= size) break;
      if (child + 1 < size && this._comparator(queue[child + 1], queue[child]) < 0) child++;
      if (this._comparator(item, queue[child]) <= 0) break;
      queue[k] = queue[child];
      k = child;
    }
    queue[k] = item;
    return result;
  }

  public peek(): T | undefined {
    return this._queue[0];
  }

  public clear(): void {
    this._queue = [];
  }

  public size(): number {
    return this._queue.length;
  }

  public empty(): boolean {
    return this._queue.length === 0;
  }
}

export default PriorityQueue;
export { PriorityQueue };
