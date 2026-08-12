import type { WorkspaceView } from './types';

interface InFlightLoad {
  generation: number;
  promise: Promise<WorkspaceView>;
}

export class WorkspaceSnapshotCache {
  private generation = 0;
  private ready?: WorkspaceView;
  private inFlight?: InFlightLoad;

  getOrLoad(loader: () => Promise<WorkspaceView>): Promise<WorkspaceView> {
    if (this.ready !== undefined) {
      return Promise.resolve(this.ready);
    }

    if (this.inFlight?.generation === this.generation) {
      return this.inFlight.promise;
    }

    const generation = this.generation;
    const promise = loader().then(
      (workspace) => {
        if (this.generation === generation && this.inFlight?.promise === promise) {
          this.ready = workspace;
          this.inFlight = undefined;
          return workspace;
        }

        return this.getOrLoad(loader);
      },
      (error) => {
        if (this.generation === generation && this.inFlight?.promise === promise) {
          this.inFlight = undefined;
          throw error;
        }

        return this.getOrLoad(loader);
      },
    );

    this.inFlight = { generation, promise };
    return promise;
  }

  replace(workspace: WorkspaceView): void {
    this.generation += 1;
    this.inFlight = undefined;
    this.ready = workspace;
  }

  invalidate(): void {
    this.generation += 1;
    this.ready = undefined;
    this.inFlight = undefined;
  }
}
