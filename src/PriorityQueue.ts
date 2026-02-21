class PriorityQueue<T extends object> {
  private _queue: Array<T>;
  private _size: number = 0;
  private _comparator: ((val: T, parent: T) => number) | null;

  constructor(initialCapacity?: number, comparator?: (val: T, parent: T) => number) {
    const cap = initialCapacity ?? 11;
    const com = comparator ?? null;
    if (cap < 1) {
      throw new Error('initial capacity must be greater than or equal to 1');
    }
    this._queue = new Array<T>(cap);
    this._comparator = com;
  }

  private grow() {
    const oldCapacity = this._size;
    // Double size if small; else grow by 50%
    const newCapacity =
      oldCapacity + (oldCapacity < 64 ? oldCapacity + 2 : oldCapacity >> 1);
    if (!Number.isSafeInteger(newCapacity)) {
      throw new Error('OOM: new capacity not a safe integer');
    }
    this._queue.length = newCapacity;
  }

  private siftup(k: number, item: T): void {
    if (this._comparator !== null) {
      this.siftupUsingComparator(k, item);
    } else {
      this.siftupComparable(k, item);
    }
  }

  /**
   * siftup of heap
   */
  private siftupUsingComparator(k: number, item: T): void {
    while (k > 0) {
      // find the parent
      const parent = (k - 1) >>> 1;
      const e = this._queue[parent] as T;
      // compare item with it parent, if item's priority less, break siftup and insert
      if (this._comparator!(item, e) >= 0) {
        break;
      }
      // if item's priority more, make it's parent sink and proceed siftup
      this._queue[k] = e;
      k = parent;
    }
    // if k === 0, then we directly insert it
    this._queue[k] = item;
  }

  private siftupComparable(k: number, item: T): void {
    while (k > 0) {
      const parent = (k - 1) >>> 1;
      const e = this._queue[parent] as T;
      if (item.toString().localeCompare(e.toString()) >= 0) {
        break;
      }
      this._queue[k] = e;
      k = parent;
    }
    this._queue[k] = item;
  }

  private sink(k: number, item: T): void {
    if (this._comparator !== null) {
      this.sinkUsingComparator(k, item);
    } else {
      this.sinkComparable(k, item);
    }
  }

  private sinkUsingComparator(k: number, item: T): void {
    const half = this._size >>> 1;
    while (k < half) {
      let child = (k << 1) + 1;
      let object = this._queue[child];
      const right = child + 1;
      // compare left right child, assign child the bigger one
      if (
        right < this._size &&
        this._comparator!(object, this._queue[right]) > 0
      ) {
        object = this._queue[(child = right)];
      }
      // compare item and child if bigger is item, break
      if (this._comparator!(item, object) <= 0) {
        break;
      }
      this._queue[k] = object!;
      k = child;
    }
    this._queue[k] = item;
  }

  private sinkComparable(k: number, item: T): void {
    const half = this._size >>> 1;
    while (k < half) {
      let child = (k << 1) + 1;
      let object = this._queue[child];
      const right = child + 1;

      if (
        right < this._size &&
        object!.toString().localeCompare(this._queue[right]!.toString())
      ) {
        object = this._queue[(child = right)];
      }
      if (item.toString().localeCompare(object!.toString()) <= 0) {
        break;
      }
      this._queue[k] = object!;
      k = child;
    }
    this._queue[k] = item;
  }

  private indexOf(item: T): number {
    for (let i = 0; i < this._queue.length; i++) {
      if (this._queue[i] === item) {
        return i;
      }
    }
    return -1;
  }

  public add(item: T): boolean {
    const i = this._size;
    if (i >= this._queue.length) {
      this.grow();
    }
    this._size = i + 1;
    if (i === 0) {
      this._queue[0] = item;
    } else {
      this.siftup(i, item);
    }
    return true;
  }

  public poll(): T | null {
    if (this._size === 0) {
      return null;
    }
    const s = --this._size;
    const result = <T>this._queue[0];
    const x = <T>this._queue[s];
    this._queue.slice(s, 1);
    if (s !== 0) {
      this.sink(0, x);
    }
    return result;
  }

  public peek(): T | null {
    return this._size === 0 ? null : <T>this._queue[0];
  }

  public contains(item: T): boolean {
    return this.indexOf(item) !== -1;
  }

  public clear(): void {
    this._queue.fill(null as unknown as T);
    this._size = 0;
  }

  public size(): number {
    return this._size;
  }

  public empty(): boolean {
    return this._size === 0;
  }

  public toArray(): Array<T> {
    return this._queue;
  }

  public toString(): string {
    return this.toArray().toString();
  }

  public [Symbol.iterator]() {
    let i = 0;
    return {
      next: () => {
        return {
          done: i == this._size,
          value: <T>this._queue[i++]
        };
      }
    };
  }
}

export default PriorityQueue;
export { PriorityQueue };