import { describe, expect, it } from 'vitest';
import { AwsTabContextStore } from './tab-context-store';
import type { AwsConsoleContext, AwsConsoleContextResult } from './types';

const readyContext = (overrides: Partial<AwsConsoleContext> = {}): AwsConsoleContext => ({
  loginAccountIdOrAlias: '111111111111',
  currentAccountIdOrAlias: '222222222222',
  multiSession: false,
  source: 'console-nav',
  ...overrides,
});

const readyResult = (overrides: Partial<AwsConsoleContext> = {}): AwsConsoleContextResult => ({
  status: 'ready',
  context: readyContext(overrides),
});

describe('AwsTabContextStore', () => {
  it('stores the first ready context and keeps an identical context usable', () => {
    const store = new AwsTabContextStore();
    const generation = store.beginRefresh(7);

    expect(store.completeRefresh(7, generation, readyResult())).toEqual(readyResult());
    expect(store.get(7)).toEqual({ tabId: 7, context: readyContext() });
    expect(store.get(7)).toEqual({ tabId: 7, context: readyContext() });
  });

  it('replaces an older ready context with a new one', () => {
    const store = new AwsTabContextStore();
    const firstGeneration = store.beginRefresh(7);
    store.completeRefresh(7, firstGeneration, readyResult());
    const secondGeneration = store.beginRefresh(7);

    expect(store.completeRefresh(7, secondGeneration, readyResult({
      currentAccountIdOrAlias: '333333333333',
    }))).toEqual(readyResult({ currentAccountIdOrAlias: '333333333333' }));
    expect(store.get(7)).toEqual({
      tabId: 7,
      context: readyContext({ currentAccountIdOrAlias: '333333333333' }),
    });
  });

  it('retains the previous ready context after a transient unavailable result', () => {
    const store = new AwsTabContextStore();
    const firstGeneration = store.beginRefresh(7);
    store.completeRefresh(7, firstGeneration, readyResult());
    const secondGeneration = store.beginRefresh(7);

    expect(store.completeRefresh(7, secondGeneration, { status: 'unavailable' })).toEqual(
      readyResult(),
    );
    expect(store.get(7)).toEqual({ tabId: 7, context: readyContext() });
  });

  it('returns unavailable and stores nothing when no ready context exists', () => {
    const store = new AwsTabContextStore();
    const generation = store.beginRefresh(7);

    expect(store.completeRefresh(7, generation, { status: 'unavailable' })).toEqual({
      status: 'unavailable',
    });
    expect(store.get(7)).toBeUndefined();
  });

  it('removes stored ready context for a non-AWS result', () => {
    const store = new AwsTabContextStore();
    const generation = store.beginRefresh(7);
    store.completeRefresh(7, generation, readyResult());
    const nextGeneration = store.beginRefresh(7);

    expect(store.completeRefresh(7, nextGeneration, { status: 'not-aws-console' })).toEqual({
      status: 'not-aws-console',
    });
    expect(store.get(7)).toBeUndefined();
  });

  it('invalidates stored context and blocks an old generation from committing', () => {
    const store = new AwsTabContextStore();
    const generation = store.beginRefresh(7);
    store.completeRefresh(7, generation, readyResult());
    const inFlightGeneration = store.beginRefresh(7);

    store.invalidate(7);

    expect(store.completeRefresh(7, inFlightGeneration, readyResult({
      currentAccountIdOrAlias: '333333333333',
    }))).toEqual({ status: 'unavailable' });
    expect(store.get(7)).toBeUndefined();
  });

  it('removes both context and generation state for a removed tab', () => {
    const store = new AwsTabContextStore();
    const generation = store.beginRefresh(7);
    store.completeRefresh(7, generation, readyResult());

    store.remove(7);

    expect(store.get(7)).toBeUndefined();
    expect(store.beginRefresh(7)).toBe(1);
  });

  it('keeps two tab contexts independent', () => {
    const store = new AwsTabContextStore();
    const tabAGeneration = store.beginRefresh(7);
    const tabBGeneration = store.beginRefresh(8);
    store.completeRefresh(7, tabAGeneration, readyResult());
    store.completeRefresh(8, tabBGeneration, readyResult({
      loginAccountIdOrAlias: '333333333333',
    }));

    expect(store.get(7)?.context.loginAccountIdOrAlias).toBe('111111111111');
    expect(store.get(8)?.context.loginAccountIdOrAlias).toBe('333333333333');
  });

  it('prevents an earlier completion from overwriting the latest generation', () => {
    const store = new AwsTabContextStore();
    const firstGeneration = store.beginRefresh(7);
    const secondGeneration = store.beginRefresh(7);

    store.completeRefresh(7, secondGeneration, readyResult({
      currentAccountIdOrAlias: '333333333333',
    }));

    expect(store.completeRefresh(7, firstGeneration, readyResult())).toEqual(readyResult({
      currentAccountIdOrAlias: '333333333333',
    }));
    expect(store.get(7)?.context.currentAccountIdOrAlias).toBe('333333333333');
  });
});
