import { describe, expect, it } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActiveBlockService } from '../../blocks/placement-palette/active-block.service';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { DecorationService } from '../../decorations/decoration.service';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import {
  LEGACY_QUICK_BLOCKS_KEY_PREFIX,
  QUICK_BLOCKS_KEY_PREFIX,
  QuickBlockBarService,
  quickEntryMatchesActive,
  quickStateKey,
} from './quick-block-bar.service';

describe('quick block active state contract', () => {
  it('exposes collapse state read-only and changes it through its owner', async () => {
    const activeBlock = new ActiveBlockService();
    const library = new BlockLibraryService(activeBlock);
    await TestBed.configureTestingModule({
      providers: [
        {
          provide: WorkspaceStateService,
          useValue: { project: signal(undefined) },
        },
        { provide: ActiveBlockService, useValue: activeBlock },
        { provide: BlockLibraryService, useValue: library },
        { provide: DecorationService, useValue: { clearActive: () => undefined } },
        QuickBlockBarService,
      ],
    }).compileComponents();
    const quickBar = TestBed.inject(QuickBlockBarService);

    expect(quickBar.collapsed).not.toHaveProperty('set');
    expect(quickBar.collapsed).not.toHaveProperty('update');
    quickBar.toggleCollapsed();
    expect(quickBar.collapsed()).toBe(true);
  });

  it('preserves a pinned BlockState when it becomes active again', () => {
    const active = new ActiveBlockService();
    active.set({
      id: 'minecraft:oak_stairs',
      state: { facing: 'north', half: 'top' },
      support: 'full',
    });
    expect(active.active()).toEqual({
      id: 'minecraft:oak_stairs',
      state: { facing: 'north', half: 'top' },
      support: 'full',
    });
  });

  it('matches a direct block even when ActiveBlock omits redundant itemId', () => {
    expect(
      quickEntryMatchesActive(
        { id: 'minecraft:stone', itemId: 'minecraft:stone', state: {} },
        { id: 'minecraft:stone', state: {} },
      ),
    ).toBe(true);
  });

  it('matches item identity and pinned state deterministically', () => {
    const entry = {
      id: 'minecraft:oak_stairs',
      itemId: 'minecraft:oak_stairs',
      state: { half: 'top', facing: 'north' },
    };
    expect(
      quickEntryMatchesActive(entry, {
        id: 'minecraft:oak_stairs',
        state: { facing: 'north', half: 'top' },
      }),
    ).toBe(true);
    expect(
      quickEntryMatchesActive(entry, {
        id: 'minecraft:oak_stairs',
        state: { facing: 'south', half: 'top' },
      }),
    ).toBe(false);
    expect(
      quickEntryMatchesActive(
        { ...entry, itemId: 'minecraft:stone', id: 'minecraft:stone' },
        { id: 'minecraft:oak_stairs', state: entry.state },
      ),
    ).toBe(false);
  });

  it('uses an unambiguous state identity regardless of property insertion order', () => {
    expect(quickStateKey({ facing: 'north', half: 'top' })).toBe(
      quickStateKey({ half: 'top', facing: 'north' }),
    );
    expect(quickStateKey({ a: 'x,b=y' })).not.toBe(quickStateKey({ a: 'x', b: 'y' }));
  });

  it('ignores malformed persisted entries without dropping valid neighboring slots', async () => {
    localStorage.setItem(
      `${LEGACY_QUICK_BLOCKS_KEY_PREFIX}project-1`,
      JSON.stringify([
        {
          id: 'minecraft:stone',
          itemId: 'minecraft:stone',
          displayName: 'Stone',
          state: { axis: 'y' },
        },
        {
          id: 'minecraft:dirt',
          itemId: 42,
          displayName: 'Dirt',
          state: {},
        },
        {
          id: 'minecraft:grass_block',
          itemId: 'minecraft:grass_block',
          displayName: 'Grass Block',
          state: { snowy: false },
        },
      ]),
    );
    const project = signal({ id: 'project-1' });
    await TestBed.configureTestingModule({
      providers: [
        { provide: WorkspaceStateService, useValue: { project } },
        ActiveBlockService,
        BlockLibraryService,
        { provide: DecorationService, useValue: { clearActive: () => undefined } },
        QuickBlockBarService,
      ],
    }).compileComponents();

    const quickBar = TestBed.inject(QuickBlockBarService);
    TestBed.flushEffects();
    const entries = quickBar.entries();
    expect(localStorage.getItem(`${QUICK_BLOCKS_KEY_PREFIX}project-1`)).not.toBeNull();
    localStorage.removeItem(`${QUICK_BLOCKS_KEY_PREFIX}project-1`);
    localStorage.removeItem(`${LEGACY_QUICK_BLOCKS_KEY_PREFIX}project-1`);
    expect(entries).toEqual([
      expect.objectContaining({
        id: 'minecraft:stone',
        itemId: 'minecraft:stone',
        state: { axis: 'y' },
      }),
    ]);
  });

  it('falls back to legacy Quick Bar data if the canonical key is malformed', async () => {
    const id = 'project-legacy-fallback';
    const legacyKey = `${LEGACY_QUICK_BLOCKS_KEY_PREFIX}${id}`;
    const canonicalKey = `${QUICK_BLOCKS_KEY_PREFIX}${id}`;
    const entry = {
      id: 'minecraft:stone',
      itemId: 'minecraft:stone',
      displayName: 'Stone',
      state: {},
    };
    localStorage.setItem(legacyKey, JSON.stringify([entry]));
    localStorage.setItem(canonicalKey, '{invalid');
    const project = signal({ id });
    await TestBed.configureTestingModule({
      providers: [
        { provide: WorkspaceStateService, useValue: { project } },
        ActiveBlockService,
        BlockLibraryService,
        { provide: DecorationService, useValue: { clearActive: () => undefined } },
        QuickBlockBarService,
      ],
    }).compileComponents();

    const quickBar = TestBed.inject(QuickBlockBarService);
    TestBed.flushEffects();
    expect(quickBar.entries()).toEqual([expect.objectContaining(entry)]);
    expect(localStorage.getItem(canonicalKey)).toBe('{invalid');
    localStorage.removeItem(legacyKey);
    localStorage.removeItem(canonicalKey);
  });

  it('does not mark an unavailable source entry active', () => {
    expect(
      quickEntryMatchesActive(
        { id: 'example:stone', itemId: 'example:stone', state: {} },
        { id: 'example:stone', state: {} },
        false,
      ),
    ).toBe(false);
    expect(
      quickEntryMatchesActive(
        { id: 'example:stone', itemId: 'example:stone', state: {} },
        { id: 'example:stone', state: {} },
        true,
      ),
    ).toBe(true);
  });
});
