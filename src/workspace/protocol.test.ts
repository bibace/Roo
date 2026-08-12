import { describe, expect, it } from 'vitest';
import { buildWorkspaceView } from './workspace-view';
import {
  parseWorkspaceRequest,
  parseWorkspaceResponse,
} from './protocol';

function validWorkspace() {
  return buildWorkspaceView({ status: 'empty' });
}

describe('Workspace request protocol', () => {
  it.each([
    { type: 'GET_WORKSPACE' },
    {
      type: 'IMPORT_CATALOG',
      expectedCatalogToken: { kind: 'empty' },
      source: { kind: 'uploaded', fileName: 'roo.json' },
      fileName: 'roo.json',
      sourceText: '{}',
    },
    {
      type: 'IMPORT_CATALOG',
      expectedCatalogToken: { kind: 'ready', catalogVersion: 3 },
      source: { kind: 'created' },
      fileName: 'roo.yaml',
      sourceText: 'version: 1',
    },
    {
      type: 'DELETE_CONFIGURATION',
      expectedCatalogToken: { kind: 'ready', catalogVersion: 3 },
      confirmationFileName: 'roo.yaml',
    },
  ])('accepts a valid strict request %j', (request) => {
    expect(parseWorkspaceRequest(request)).toEqual(request);
  });

  it.each([
    { type: 'GET_WORKSPACE', extra: true },
    { type: 'UNKNOWN' },
    { type: 'ADD_ACCOUNT' },
    {
      type: 'IMPORT_CATALOG',
      expectedCatalogToken: { kind: 'empty' },
      source: { kind: 'created' },
      fileName: 'roo.json',
      sourceText: '{}',
      extra: true,
    },
    {
      type: 'IMPORT_CATALOG',
      expectedCatalogToken: { kind: 'empty' },
      fileName: 'roo.json',
      sourceText: '{}',
    },
    {
      type: 'IMPORT_CATALOG',
      expectedCatalogToken: { kind: 'empty' },
      source: { kind: 'uploaded' },
      fileName: 'roo.json',
      sourceText: '{}',
    },
    {
      type: 'IMPORT_CATALOG',
      expectedCatalogToken: { kind: 'empty' },
      source: { kind: 'uploaded', fileName: '../roo.yaml' },
      fileName: 'roo.yaml',
      sourceText: '{}',
    },
    {
      type: 'IMPORT_CATALOG',
      expectedCatalogToken: { kind: 'empty' },
      source: { kind: 'uploaded', fileName: 'roo\n.yaml' },
      fileName: 'roo.yaml',
      sourceText: '{}',
    },
    {
      type: 'IMPORT_CATALOG',
      expectedCatalogToken: { kind: 'empty' },
      source: { kind: 'uploaded', fileName: 'roo.txt' },
      fileName: 'roo.yaml',
      sourceText: '{}',
    },
    {
      type: 'DELETE_CONFIGURATION',
      expectedCatalogToken: { kind: 'empty' },
      confirmationFileName: 'roo.yaml',
    },
    {
      type: 'DELETE_CONFIGURATION',
      expectedCatalogToken: { kind: 'invalid' },
      confirmationFileName: 'roo.yaml',
    },
    {
      type: 'DELETE_CONFIGURATION',
      expectedCatalogToken: { kind: 'ready', catalogVersion: 0 },
      confirmationFileName: 'roo.yaml',
    },
    {
      type: 'DELETE_CONFIGURATION',
      expectedCatalogToken: { kind: 'ready', catalogVersion: 1 },
    },
    {
      type: 'DELETE_CONFIGURATION',
      expectedCatalogToken: { kind: 'ready', catalogVersion: 1 },
      confirmationFileName: '',
    },
    {
      type: 'DELETE_CONFIGURATION',
      expectedCatalogToken: { kind: 'ready', catalogVersion: 1 },
      confirmationFileName: 'roo.yaml',
      extra: true,
    },
    null,
    [],
  ])('rejects malformed or extra-field requests %j', (request) => {
    expect(parseWorkspaceRequest(request)).toBeUndefined();
  });
});

describe('Workspace response protocol', () => {
  it('accepts a valid success envelope and returns its shared Workspace View', () => {
    const workspace = validWorkspace();

    expect(parseWorkspaceResponse({ ok: true, workspace })).toEqual({ ok: true, workspace });
  });

  it('does not duplicate deep Workspace validation at the response boundary', () => {
    const workspace = validWorkspace();
    workspace.status = 'unexpected' as never;

    expect(parseWorkspaceResponse({ ok: true, workspace })).toEqual({ ok: true, workspace });
  });

  it.each([
    { ok: true },
    { ok: true, workspace: null },
    { ok: true, workspace: [] },
    { ok: true, workspace: {}, extra: true },
  ])('rejects a missing or non-object Workspace envelope %j', (response) => {
    expect(parseWorkspaceResponse(response)).toBeUndefined();
  });

  it('accepts a valid failure envelope', () => {
    expect(parseWorkspaceResponse({
      ok: false,
      error: { code: 'INVALID_CATALOG', message: 'Configuration is invalid.' },
    })).toEqual({
      ok: false,
      error: { code: 'INVALID_CATALOG', message: 'Configuration is invalid.' },
    });
  });

  it.each([
    { ok: false, error: { code: 'UNKNOWN', message: 'safe' } },
    { ok: false, error: { code: 'INVALID_CATALOG', message: 7 } },
    { ok: false, error: { code: 'INVALID_CATALOG', message: 'safe', extra: true } },
    { ok: false, error: { code: 'INVALID_CATALOG', message: 'safe' }, extra: true },
    { ok: 'yes', error: { code: 'INVALID_CATALOG', message: 'safe' } },
  ])('rejects malformed failure or unknown top-level response shapes %j', (response) => {
    expect(parseWorkspaceResponse(response)).toBeUndefined();
  });
});
