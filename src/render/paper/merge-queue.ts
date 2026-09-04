import { mergeJsons } from "./merge-layer";

export type MergeBaker = (
  baseJson: string,
  additionsJson: string,
  emfActive: boolean,
) => Promise<string>;

type MergeResult = {
  id: number;
  mergedJson?: string;
  error?: string;
};

function bakeOnMain(
  baseJson: string,
  additionsJson: string,
  emfActive: boolean,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const run = () => {
      try {
        resolve(mergeJsons(baseJson, additionsJson, emfActive));
      } catch (error) {
        reject(error);
      }
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => run());
    } else {
      setTimeout(run, 0);
    }
  });
}

function createWorkerBaker(): MergeBaker | null {
  try {
    const worker = new Worker(new URL("./merge-worker.ts", import.meta.url), {
      type: "module",
    });
    let nextId = 1;
    const pending = new Map<
      number,
      { resolve: (json: string) => void; reject: (error: Error) => void }
    >();
    worker.onmessage = (event: MessageEvent<MergeResult>) => {
      const { id, mergedJson, error } = event.data;
      const waiter = pending.get(id);
      if (!waiter) return;
      pending.delete(id);
      if (error || mergedJson === undefined) {
        waiter.reject(new Error(error ?? "empty merge result"));
        return;
      }
      waiter.resolve(mergedJson);
    };
    worker.onerror = (event) => {
      const err = new Error(event.message || "merge worker error");
      for (const waiter of pending.values()) waiter.reject(err);
      pending.clear();
    };
    return (baseJson, additionsJson, emfActive) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, baseJson, additionsJson, emfActive });
      });
  } catch {
    return null;
  }
}

export function createMergeBaker(): MergeBaker {
  const workerBake = createWorkerBaker();
  if (!workerBake) return bakeOnMain;
  return async (baseJson, additionsJson, emfActive) => {
    try {
      return await workerBake(baseJson, additionsJson, emfActive);
    } catch {
      return bakeOnMain(baseJson, additionsJson, emfActive);
    }
  };
}

type PendingItem = { id: number; remove(): void };

type Job = {
  layerId: string;
  items: PendingItem[];
  additionsJson: string;
  emfActive: boolean;
};

export class MergeQueue {
  private jobs: Job[] = [];
  private inFlight = false;
  private epoch = 0;
  private waiters: Array<() => void> = [];
  private readonly deps: {
    bake: MergeBaker;
    getBaseJson: (layerId: string) => string;
    apply: (layerId: string, mergedJson: string, items: PendingItem[]) => void;
    /** Bake failed: merge the pending items synchronously so no stroke is orphaned. */
    commitNow: (layerId: string, items: PendingItem[]) => void;
    onBaked: () => void;
  };

  constructor(deps: MergeQueue["deps"]) {
    this.deps = deps;
  }

  enqueue(
    layerId: string,
    items: PendingItem[],
    additionsJson: string,
    emfActive: boolean,
  ): void {
    this.jobs.push({ layerId, items, additionsJson, emfActive });
    void this.kick();
  }

  idle(): Promise<void> {
    if (!this.inFlight && this.jobs.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  discard(): void {
    this.epoch++;
    this.jobs = [];
  }

  private async kick(): Promise<void> {
    if (this.inFlight) return;
    const job = this.jobs.shift();
    if (!job) {
      for (const waiter of this.waiters.splice(0)) waiter();
      return;
    }
    this.inFlight = true;
    const epoch = this.epoch;
    try {
      const baseJson = this.deps.getBaseJson(job.layerId);
      let mergedJson: string | null = null;
      try {
        mergedJson = await this.deps.bake(baseJson, job.additionsJson, job.emfActive);
      } catch (error) {
        console.error("Merge bake failed, committing on main thread:", error);
      }
      if (epoch !== this.epoch) return;
      if (mergedJson === null) this.deps.commitNow(job.layerId, job.items);
      else this.deps.apply(job.layerId, mergedJson, job.items);
      this.deps.onBaked();
    } catch (error) {
      console.error("Merge apply failed:", error);
    } finally {
      this.inFlight = false;
    }
    void this.kick();
  }
}
