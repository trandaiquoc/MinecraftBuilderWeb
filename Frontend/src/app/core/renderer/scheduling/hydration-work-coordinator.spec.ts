import { describe, expect, it } from 'vitest';
import { HydrationWorkCoordinator } from './hydration-work-coordinator';

interface Job { readonly key: string; readonly token: number; readonly providerRefresh?: boolean; }

function regular(key: string): Job { return { key, token: 1 }; }
function refresh(key: string): Job { return { key, token: 1, providerRefresh: true }; }

describe('HydrationWorkCoordinator', () => {
  it('prevents provider refresh from starving regular hydration', () => {
    const coordinator = new HydrationWorkCoordinator<Job>();
    for (let index = 0; index < 100; index += 1) coordinator.enqueueRegular(regular(`regular-${index}`));
    for (let index = 0; index < 1000; index += 1) coordinator.enqueueProviderRefresh(refresh(`refresh-${index}`));

    const firstCycle = Array.from({ length: 6 }, () => coordinator.takeNext(1)!);
    expect(firstCycle.map((job) => job.providerRefresh ? 'refresh' : 'regular')).toEqual(['regular', 'regular', 'refresh', 'regular', 'regular', 'refresh']);
    expect(coordinator.counts()).toMatchObject({ regularRunning: 4, providerRefreshRunning: 2, regularQueued: 96, providerRefreshQueued: 998 });
    firstCycle.forEach((job) => coordinator.complete(job));

    const completedRegular: string[] = [];
    for (let cycle = 0; cycle < 5; cycle += 1) {
      const jobs = Array.from({ length: 6 }, () => coordinator.takeNext(1)!);
      completedRegular.push(...jobs.filter((job) => !job.providerRefresh).map((job) => job.key));
      jobs.forEach((job) => coordinator.complete(job));
    }
    expect(completedRegular.length).toBeGreaterThan(0);
    expect(coordinator.queuedRegular()).toBeLessThan(96);
  });

  it('reuses all capacity when one queue is empty', () => {
    const regularOnly = new HydrationWorkCoordinator<Job>();
    for (let index = 0; index < 8; index += 1) regularOnly.enqueueRegular(regular(`regular-${index}`));
    const regularJobs = Array.from({ length: 6 }, () => regularOnly.takeNext(1)!);
    expect(regularJobs.every((job) => !job.providerRefresh)).toBe(true);
    regularJobs.forEach((job) => regularOnly.complete(job));

    const refreshOnly = new HydrationWorkCoordinator<Job>();
    for (let index = 0; index < 8; index += 1) refreshOnly.enqueueProviderRefresh(refresh(`refresh-${index}`));
    const refreshJobs = Array.from({ length: 6 }, () => refreshOnly.takeNext(1)!);
    expect(refreshJobs.every((job) => job.providerRefresh)).toBe(true);
    expect(refreshOnly.counts()).toMatchObject({ providerRefreshRunning: 6, regularRunning: 0 });
  });

  it('deduplicates refresh keys and releases the key on success or failure completion', () => {
    const coordinator = new HydrationWorkCoordinator<Job>();
    expect(coordinator.enqueueProviderRefresh(refresh('same'))).toBe(true);
    expect(coordinator.enqueueProviderRefresh(refresh('same'))).toBe(false);
    const job = coordinator.takeNext(1)!;
    expect(coordinator.counts().providerRefreshRunning).toBe(1);
    coordinator.complete(job);
    expect(coordinator.enqueueProviderRefresh(refresh('same'))).toBe(true);
  });

  it('discards stale queued work without consuming a running slot', () => {
    const coordinator = new HydrationWorkCoordinator<Job>();
    coordinator.enqueueRegular({ key: 'stale', token: 1 });
    coordinator.enqueueRegular({ key: 'current', token: 2 });
    expect(coordinator.takeNext(2)?.key).toBe('current');
    expect(coordinator.counts()).toMatchObject({ regularRunning: 1, regularQueued: 0 });
  });

  it('cleans a stale refresh key so a later generation can queue the same voxel', () => {
    const coordinator = new HydrationWorkCoordinator<Job>();
    coordinator.enqueueProviderRefresh({ key: 'same', token: 1, providerRefresh: true });
    expect(coordinator.takeNext(2)).toBeUndefined();
    expect(coordinator.enqueueProviderRefresh({ key: 'same', token: 2, providerRefresh: true })).toBe(true);
  });

  it('removes pending refresh work without releasing an in-flight provider slot', () => {
    const coordinator = new HydrationWorkCoordinator<Job>();
    coordinator.enqueueProviderRefresh(refresh('running'));
    coordinator.enqueueProviderRefresh(refresh('pending'));
    const running = coordinator.takeNext(1)!;
    coordinator.removePendingKeys(new Set(['pending']));
    expect(coordinator.counts()).toMatchObject({ providerRefreshQueued: 0, providerRefreshRunning: 1 });
    coordinator.complete(running);
    expect(coordinator.counts().totalRunning).toBe(0);
  });

  it('removes every queued entry for changed keys without disturbing unrelated order or counts', () => {
    const coordinator = new HydrationWorkCoordinator<Job>();
    coordinator.enqueueRegular(regular('keep-1'));
    coordinator.enqueueRegular(regular('changed'));
    coordinator.enqueueRegular(regular('keep-2'));
    coordinator.enqueueRegular(regular('changed'));
    coordinator.enqueueProviderRefresh(refresh('refresh-changed'));
    coordinator.enqueueProviderRefresh(refresh('refresh-keep'));

    coordinator.removePendingKeys(new Set(['changed', 'refresh-changed']));

    expect(coordinator.counts()).toMatchObject({ regularQueued: 2, providerRefreshQueued: 1, totalRunning: 0 });
    expect([coordinator.takeNext(1)?.key, coordinator.takeNext(1)?.key, coordinator.takeNext(1)?.key])
      .toEqual(['keep-1', 'keep-2', 'refresh-keep']);
    expect(coordinator.queuedTotal()).toBe(0);
  });
});
