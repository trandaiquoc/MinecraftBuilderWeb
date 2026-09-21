import { describe, expect, it } from 'vitest';
import { AssetActivityService } from './asset-activity.service';

describe('AssetActivityService', () => {
  it('keeps one current progress event and bounds history', () => {
    const activity = new AssetActivityService();
    activity.begin('download', 'Downloading');
    activity.update({ loaded: 4, total: 10 });
    expect(activity.current()?.progress).toEqual({ loaded: 4, total: 10 });
    for (let index = 0; index < 110; index += 1) activity.event('step', `Step ${index}`);
    expect(activity.entries()).toHaveLength(100);
    expect(activity.entries().filter((entry) => entry.message === 'Downloading')).toHaveLength(0);
  });

  it('records success/error transitions without persisting project data', () => {
    const activity = new AssetActivityService();
    activity.begin('cache', 'Checking cache', 'cache');
    activity.finish('ready', 'Ready');
    expect(activity.current()).toBeUndefined();
    expect(activity.entries().at(-1)).toMatchObject({ operation: 'ready', level: 'success' });
    activity.fail('download', 'Failed');
    expect(activity.current()).toMatchObject({ level: 'error', message: 'Failed' });
  });

  it('tracks protected operations independently from the activity feed', () => {
    const activity = new AssetActivityService();
    const id = activity.protect('Downloading assets');
    expect(activity.hasProtectedOperation()).toBe(true);
    expect(activity.protectedOperations()).toEqual([{ id, label: 'Downloading assets' }]);
    activity.releaseProtected(id);
    expect(activity.hasProtectedOperation()).toBe(false);
  });
});
