import type { AwsConsoleContext, AwsConsoleContextResult } from './types';

export interface AwsTabContextRecord {
  tabId: number;
  context: AwsConsoleContext;
}

export class AwsTabContextStore {
  private readonly contexts = new Map<number, AwsConsoleContext>();
  private readonly refreshGenerations = new Map<number, number>();

  get(tabId: number): AwsTabContextRecord | undefined {
    const context = this.contexts.get(tabId);

    return context === undefined ? undefined : { tabId, context };
  }

  beginRefresh(tabId: number): number {
    const generation = (this.refreshGenerations.get(tabId) ?? 0) + 1;
    this.refreshGenerations.set(tabId, generation);
    return generation;
  }

  completeRefresh(
    tabId: number,
    generation: number,
    result: AwsConsoleContextResult,
  ): AwsConsoleContextResult {
    if (this.refreshGenerations.get(tabId) !== generation) {
      const context = this.contexts.get(tabId);
      return context === undefined
        ? { status: 'unavailable' }
        : { status: 'ready', context };
    }

    if (result.status === 'ready') {
      this.contexts.set(tabId, result.context);
      return result;
    }

    if (result.status === 'not-aws-console') {
      this.contexts.delete(tabId);
      return result;
    }

    const context = this.contexts.get(tabId);
    return context === undefined
      ? result
      : { status: 'ready', context };
  }

  invalidate(tabId: number): void {
    this.beginRefresh(tabId);
    this.contexts.delete(tabId);
  }

  remove(tabId: number): void {
    this.contexts.delete(tabId);
    this.refreshGenerations.delete(tabId);
  }
}
