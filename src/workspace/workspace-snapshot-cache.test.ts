import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceView } from './types';
import { WorkspaceSnapshotCache } from './workspace-snapshot-cache';

function workspace(id: string): WorkspaceView {
  return { id } as unknown as WorkspaceView;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('WorkspaceSnapshotCache', () => {
  it('uses a ready cache hit', async () => {
    const cache = new WorkspaceSnapshotCache();
    const ready = workspace('ready');
    const loader = vi.fn().mockResolvedValue(ready);

    await expect(cache.getOrLoad(loader)).resolves.toBe(ready);
    await expect(cache.getOrLoad(loader)).resolves.toBe(ready);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent cold reads', async () => {
    const cache = new WorkspaceSnapshotCache();
    const load = deferred<WorkspaceView>();
    const loader = vi.fn(() => load.promise);

    const first = cache.getOrLoad(loader);
    const second = cache.getOrLoad(loader);
    load.resolve(workspace('loaded'));

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ id: 'loaded' }),
      expect.objectContaining({ id: 'loaded' }),
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('cleans up a current-generation rejection', async () => {
    const cache = new WorkspaceSnapshotCache();
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce(workspace('retry'));

    await expect(cache.getOrLoad(loader)).rejects.toThrow('failed');
    await expect(cache.getOrLoad(loader)).resolves.toEqual(expect.objectContaining({ id: 'retry' }));
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('loads fresh data after normal invalidation', async () => {
    const cache = new WorkspaceSnapshotCache();
    const loader = vi.fn()
      .mockResolvedValueOnce(workspace('first'))
      .mockResolvedValueOnce(workspace('second'));

    await cache.getOrLoad(loader);
    cache.invalidate();

    await expect(cache.getOrLoad(loader)).resolves.toEqual(expect.objectContaining({ id: 'second' }));
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('converges old and post-invalidate callers on a fresh result after old resolve', async () => {
    const cache = new WorkspaceSnapshotCache();
    const oldLoad = deferred<WorkspaceView>();
    const freshLoad = deferred<WorkspaceView>();
    const loader = vi.fn()
      .mockImplementationOnce(() => oldLoad.promise)
      .mockImplementationOnce(() => freshLoad.promise);

    const oldCaller = cache.getOrLoad(loader);
    cache.invalidate();
    const freshCaller = cache.getOrLoad(loader);
    oldLoad.resolve(workspace('stale'));
    freshLoad.resolve(workspace('fresh'));

    await expect(oldCaller).resolves.toEqual(expect.objectContaining({ id: 'fresh' }));
    await expect(freshCaller).resolves.toEqual(expect.objectContaining({ id: 'fresh' }));
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('ignores an old rejection and joins the fresh in-flight load after invalidation', async () => {
    const cache = new WorkspaceSnapshotCache();
    const oldLoad = deferred<WorkspaceView>();
    const freshLoad = deferred<WorkspaceView>();
    const loader = vi.fn()
      .mockImplementationOnce(() => oldLoad.promise)
      .mockImplementationOnce(() => freshLoad.promise);

    const oldCaller = cache.getOrLoad(loader);
    cache.invalidate();
    const freshCaller = cache.getOrLoad(loader);
    oldLoad.reject(new Error('stale failure'));
    freshLoad.resolve(workspace('fresh'));

    await expect(oldCaller).resolves.toEqual(expect.objectContaining({ id: 'fresh' }));
    await expect(freshCaller).resolves.toEqual(expect.objectContaining({ id: 'fresh' }));
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('returns a replacement to an old caller after old resolve without another load', async () => {
    const cache = new WorkspaceSnapshotCache();
    const oldLoad = deferred<WorkspaceView>();
    const loader = vi.fn(() => oldLoad.promise);
    const oldCaller = cache.getOrLoad(loader);

    cache.replace(workspace('replacement'));
    oldLoad.resolve(workspace('stale'));

    await expect(oldCaller).resolves.toEqual(expect.objectContaining({ id: 'replacement' }));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('returns a replacement to an old caller after old reject without leaking the error', async () => {
    const cache = new WorkspaceSnapshotCache();
    const oldLoad = deferred<WorkspaceView>();
    const loader = vi.fn(() => oldLoad.promise);
    const oldCaller = cache.getOrLoad(loader);

    cache.replace(workspace('replacement'));
    oldLoad.reject(new Error('stale failure'));

    await expect(oldCaller).resolves.toEqual(expect.objectContaining({ id: 'replacement' }));
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
