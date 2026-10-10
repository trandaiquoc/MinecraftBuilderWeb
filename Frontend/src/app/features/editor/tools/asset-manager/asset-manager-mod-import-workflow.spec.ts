import { describe, expect, it, vi } from 'vitest';
import type { ContentAssetRuntimeService } from '../../../../core/assets/content-asset-runtime.service';
import type {
  ModImportProgress,
  PreparedModImport,
} from '../../../../core/assets/mod/external-mod-importer';
import { ModImportTimeoutError } from '../../../../core/assets/mod/mod-import-cancellation';
import type { I18nService } from '../../../../core/ui/localization/i18n.service';
import { AssetManagerModImportWorkflow } from './asset-manager-mod-import-workflow';

function prepared(canActivate = true): PreparedModImport {
  return {
    canActivate,
    dispose: vi.fn(),
    resources: new Map(),
    report: undefined,
  } as unknown as PreparedModImport;
}

function setup() {
  const activity = {
    begin: vi.fn(),
    update: vi.fn(),
    finish: vi.fn(),
    cancel: vi.fn(),
    timeout: vi.fn(),
    fail: vi.fn(),
  };
  const assets = {
    activity,
    inspectModJar: vi.fn(),
    commitPreparedModImport: vi.fn(),
  };
  const i18n = { t: (key: string) => key };
  return {
    activity,
    assets,
    workflow: new AssetManagerModImportWorkflow(
      assets as unknown as ContentAssetRuntimeService,
      i18n as unknown as I18nService,
    ),
  };
}

function file(name = 'mod.jar'): File {
  return { name, size: 12 } as File;
}

describe('AssetManagerModImportWorkflow', () => {
  it('owns successful preflight state and disposes a previous prepared payload when the file changes', async () => {
    const { assets, workflow } = setup();
    const first = prepared();
    const second = prepared();
    assets.inspectModJar.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    await workflow.inspect(file('first.jar'));
    expect(workflow.preflight()).toBe(first);
    expect(workflow.operationStatus()).toBe('ready');
    expect(workflow.importing()).toBe(false);

    await workflow.inspect(file('second.jar'));
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(workflow.preflight()).toBe(second);
    expect(assets.inspectModJar).toHaveBeenCalledTimes(2);
    workflow.dispose();
    expect(second.dispose).toHaveBeenCalledOnce();
  });

  it('aborts stale inspection and disposes a late prepared result without publishing it', async () => {
    const { assets, workflow } = setup();
    let resolveInspection!: (value: PreparedModImport) => void;
    const late = prepared();
    let requestSignal: AbortSignal | undefined;
    assets.inspectModJar.mockImplementation(
      (_file: File, _progress: (progress: ModImportProgress) => void, signal: AbortSignal) => {
        requestSignal = signal;
        return new Promise((resolve) => {
          resolveInspection = resolve;
        });
      },
    );

    const inspection = workflow.inspect(file());
    expect(workflow.importing()).toBe(true);
    workflow.cancel();
    expect(requestSignal?.aborted).toBe(true);
    resolveInspection(late);
    await inspection;

    expect(late.dispose).toHaveBeenCalledOnce();
    expect(workflow.preflight()).toBeUndefined();
    expect(workflow.operationKind()).toBeUndefined();
    expect(workflow.importing()).toBe(false);
    workflow.dispose();
  });

  it('retains retry eligibility after timeout and replaces the operation generation on retry', async () => {
    const { assets, activity, workflow } = setup();
    const result = prepared();
    assets.inspectModJar
      .mockRejectedValueOnce(new ModImportTimeoutError('opening-archive', 60_000))
      .mockResolvedValueOnce(result);

    await workflow.inspect(file());
    expect(workflow.operationStatus()).toBe('timed-out');
    expect(workflow.preflightError()).toContain('assetManagerTaskTimedOut');
    expect(workflow.canRetry()).toBe(true);
    expect(activity.timeout).toHaveBeenCalledOnce();

    workflow.retry();
    await vi.waitFor(() => expect(workflow.preflight()).toBe(result));
    expect(assets.inspectModJar).toHaveBeenCalledTimes(2);
    expect(workflow.operationStatus()).toBe('ready');
    workflow.dispose();
  });

  it('commits one prepared source, disposes it once, and blocks a duplicate commit while pending', async () => {
    const { assets, workflow } = setup();
    const value = prepared();
    assets.inspectModJar.mockResolvedValue(value);
    let resolveCommit!: () => void;
    assets.commitPreparedModImport.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveCommit = resolve;
      }),
    );
    await workflow.inspect(file());

    const first = workflow.confirm();
    const second = await workflow.confirm();
    expect(second).toBe(false);
    expect(assets.commitPreparedModImport).toHaveBeenCalledOnce();
    resolveCommit();
    expect(await first).toBe(true);
    expect(value.dispose).toHaveBeenCalledOnce();
    expect(workflow.preflight()).toBeUndefined();
    workflow.dispose();
    expect(value.dispose).toHaveBeenCalledOnce();
  });

  it('cancels an in-flight commit without publishing stale completion state', async () => {
    const { assets, workflow } = setup();
    const value = prepared();
    assets.inspectModJar.mockResolvedValue(value);
    let resolveCommit!: () => void;
    let commitSignal: AbortSignal | undefined;
    assets.commitPreparedModImport.mockImplementation(
      (_prepared: PreparedModImport, _progress: unknown, signal: AbortSignal) => {
        commitSignal = signal;
        return new Promise<void>((resolve) => {
          resolveCommit = resolve;
        });
      },
    );
    await workflow.inspect(file());

    const commit = workflow.confirm();
    workflow.cancel();
    expect(commitSignal?.aborted).toBe(true);
    resolveCommit();
    expect(await commit).toBe(false);
    expect(value.dispose).toHaveBeenCalledOnce();
    expect(workflow.preflight()).toBeUndefined();
    expect(workflow.operationKind()).toBeUndefined();
    workflow.dispose();
    expect(value.dispose).toHaveBeenCalledOnce();
  });

  it('releases active operation and prepared resources when the dialog owner is disposed', async () => {
    const { assets, workflow } = setup();
    const value = prepared();
    assets.inspectModJar.mockResolvedValue(value);
    await workflow.inspect(file());

    workflow.dispose();
    workflow.dispose();

    expect(value.dispose).toHaveBeenCalledOnce();
    expect(workflow.preflight()).toBeUndefined();
    expect(workflow.canRetry()).toBe(false);
  });

  it('is terminal after disposal and cannot start another import or commit', async () => {
    const { assets, workflow } = setup();
    workflow.dispose();

    await workflow.inspect(file());
    expect(await workflow.confirm()).toBe(false);
    workflow.retry();

    expect(assets.inspectModJar).not.toHaveBeenCalled();
    expect(assets.commitPreparedModImport).not.toHaveBeenCalled();
    expect(workflow.importing()).toBe(false);
  });
});
