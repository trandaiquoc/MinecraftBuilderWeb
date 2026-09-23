import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DialogService } from '../../../../core/ui/dialog/dialog.service';
import { I18nService } from '../../../../core/ui/localization/i18n.service';
import { GroupService } from '../../../../core/editor/groups/group.service';
import { SelectionService } from '../../../../core/editor/selection/selection.service';
import { WorkspaceStateService } from '../../../../core/workspace/workspace-state.service';
import { GroupsPanelComponent } from './groups-panel.component';

describe('GroupsPanelComponent visual state contract', () => {
  it('switches active group styling without hiding lock metadata', async () => {
    const groups = [
      { id: 'roof', name: 'Roof', visible: true, locked: true },
      { id: 'entrance', name: 'Entrance', visible: true, locked: false },
    ];
    const activeGroupId = signal<string | undefined>(undefined);
    const activeGroup = signal<(typeof groups)[number] | undefined>(undefined);
    const workspace = { project: signal({ groups }) };
    const groupService = {
      activeGroupId,
      activeGroup,
      activeGroupBlockCount: signal(0),
      isolatedGroupId: signal<string | undefined>(undefined),
      select: vi.fn((id: string) => { activeGroupId.set(id); activeGroup.set(groups.find((group) => group.id === id)); }),
      create: vi.fn(),
      renameActive: vi.fn(),
      setActiveVisible: vi.fn(),
      setActiveLocked: vi.fn(),
      addSelectionToActive: vi.fn(),
      removeSelectionFromActive: vi.fn(),
      isolateActive: vi.fn(),
      deleteActive: vi.fn(),
      deleteActiveBlocks: vi.fn(),
    };
    const selection = { logicalPositions: signal([]), single: signal(undefined), box: signal(undefined) };
    const i18n = { t: (key: string) => ({ groupName: 'Group name', createGroup: 'Create', searchGroups: 'Search', clearSearch: 'Clear', locked: 'locked', unlocked: 'unlocked', groupLockedState: 'Locked', groupUnlockedState: 'Unlocked', noGroupResults: 'No results', noGroups: 'No groups', blockCount: 'blocks', renameGroup: 'Rename', hideGroup: 'Hide', showGroup: 'Show', unlockGroup: 'Unlock', lockGroup: 'Lock', addSelectionToGroup: 'Add', removeSelectionFromGroup: 'Remove', isolateGroup: 'Isolate', hideMove: 'Hide move', showMove: 'Show move', deleteGroup: 'Delete', deleteGroupBlocks: 'Delete blocks', deleteGroupBlocksTitle: 'Delete', deleteGroupBlocksConfirmation: 'Delete', deleteGroupBlocksConfirm: 'Delete', cancel: 'Cancel' }[key] ?? key) };
    await TestBed.configureTestingModule({
      imports: [GroupsPanelComponent],
      providers: [
        { provide: I18nService, useValue: i18n },
        { provide: DialogService, useValue: { confirm: vi.fn() } },
        { provide: GroupService, useValue: groupService },
        { provide: WorkspaceStateService, useValue: workspace },
        { provide: SelectionService, useValue: selection },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(GroupsPanelComponent);
    fixture.detectChanges();
    const buttons = () => [...fixture.nativeElement.querySelectorAll('.group-item')] as HTMLButtonElement[];

    expect(buttons()[0].getAttribute('aria-pressed')).toBe('false');
    buttons()[0].click();
    fixture.detectChanges();
    expect(buttons()[0].classList.contains('active')).toBe(true);
    expect(buttons()[0].getAttribute('aria-pressed')).toBe('true');
    expect(buttons()[0].textContent).toContain('Locked');
    buttons()[1].click();
    fixture.detectChanges();
    expect(buttons()[0].classList.contains('active')).toBe(false);
    expect(buttons()[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons()[1].textContent).toContain('Unlocked');
  });
});
