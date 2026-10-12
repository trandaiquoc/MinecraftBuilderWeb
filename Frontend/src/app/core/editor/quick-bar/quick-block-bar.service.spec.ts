import { describe, expect, it } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActiveBlockService } from '../../blocks/placement-palette/active-block.service';
import { BlockLibraryService } from '../../blocks/catalog/block-library.service';
import { DecorationService } from '../../decorations/decoration.service';
import { WorkspaceStateService } from '../../workspace/workspace-state.service';
import {
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
