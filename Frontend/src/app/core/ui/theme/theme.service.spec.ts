import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
// @ts-expect-error Vitest executes the stylesheet contract test in Node.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UiPreferencesService } from '../preferences/ui-preferences.service';
import { ThemeService } from './theme.service';

const preferencesKey = 'the-block-laundromat.ui-preferences';

const workspaceTokens: Readonly<Record<string, string>> = {
  'App Background': '--workspace-app-bg',
  'Header / Status bar': '--workspace-header-bg',
  Sidebar: '--workspace-sidebar-bg',
  'Panel / Dialog': '--workspace-panel-bg',
  'Input / Raised': '--workspace-raised',
  'Surface Muted': '--workspace-muted',
  'Surface Hover': '--workspace-hover',
  'Selected Surface': '--workspace-selected',
  Border: '--workspace-border',
  'Primary Text': '--workspace-text-primary',
  'Secondary Text': '--workspace-text-secondary',
  'Header Text': '--workspace-header-text',
  'Sidebar Text': '--workspace-sidebar-text',
  'Disabled Text': '--workspace-text-disabled',
  'Primary / Accent': '--workspace-primary',
  'Primary Hover': '--workspace-primary-hover',
  'Text on Primary': '--workspace-text-on-primary',
  'Secondary Accent': '--workspace-secondary-accent',
  'Focus / Outline': '--workspace-focus',
  Success: '--workspace-success',
  Warning: '--workspace-warning',
  'Danger / Error': '--workspace-danger',
  Info: '--workspace-info',
};

const relativeLuminance = (hex: string): number => {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => parseInt(channel, 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

const contrastRatio = (foreground: string, background: string): number => {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

const mixColors = (foreground: string, background: string, foregroundPercent: number): string => {
  const foregroundChannels = foreground
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => parseInt(channel, 16));
  const backgroundChannels = background
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => parseInt(channel, 16));
  const weight = foregroundPercent / 100;
  return `#${foregroundChannels
    .map((channel, index) =>
      Math.round(channel * weight + backgroundChannels[index] * (1 - weight))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};

describe('Workspace color palette contract', () => {
  it('matches the approved 92 colors and keeps generic tokens workspace-scoped', () => {
    const stylesheet = String(readFileSync('src/styles.scss', 'utf8'));
    const designContract = String(
      readFileSync('../Docs/design/workspace-color-palette.md', 'utf8'),
    );
    const paletteStyles = stylesheet.slice(stylesheet.indexOf('/* Workspace Palette V1'));
    const themeNames = ['craft', 'light', 'raccoon', 'dark'] as const;
    const themeColumns = ['Minecraft (`craft`)', 'Light', 'Raccoon', 'Dark'];
    const tableHeader = designContract
      .split(/\r?\n/)
      .find((line) => /^\|\s*Semantic role\s*\|/.test(line));
    expect(tableHeader).toBeDefined();

    const documentedThemes = tableHeader!.split('|').map((cell) => cell.trim());
    expect(documentedThemes.slice(2, 6)).toEqual(themeColumns);

    const documentedPalette = new Map<string, readonly string[]>();
    for (const row of designContract.split(/\r?\n/).filter((line) => /^\| [^|]+ \| #/.test(line))) {
      const [role, ...colors] = row
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      documentedPalette.set(role, colors);
    }
    expect(documentedPalette.size).toBe(23);

    for (const [themeIndex, themeName] of themeNames.entries()) {
      const themeBlock = paletteStyles.match(
        new RegExp(`:root\\[data-theme='${themeName}'\\]\\s*\\{([^}]+)\\}`),
      )?.[1];
      expect(themeBlock, `missing ${themeName} Workspace palette`).toBeDefined();
      for (const [role, token] of Object.entries(workspaceTokens)) {
        const expected = documentedPalette.get(role)?.[themeIndex];
        const actual = themeBlock!.match(new RegExp(`${token}:\\s*(#[0-9A-Fa-f]{6});`))?.[1];
        expect(actual?.toUpperCase(), `${themeName}: ${role}`).toBe(expected?.toUpperCase());
      }
    }

    expect(paletteStyles).toContain(':root[data-theme] app-editor-shell');
    expect(paletteStyles).toContain(
      ':root[data-theme]:has(app-editor-shell) .cdk-overlay-container',
    );
    expect(paletteStyles).toContain('--button-secondary-bg: var(--workspace-muted);');
    expect(paletteStyles).toContain('--secondary-accent: var(--workspace-secondary-accent);');
    expect(paletteStyles).toContain('background: var(--workspace-header-bg);');
    expect(paletteStyles).toContain('color: var(--workspace-header-text);');
    expect(stylesheet).toContain('--app-bg: #101318;');
    expect(stylesheet).toContain('--app-bg: #f4f6f8;');
    expect(
      String(readFileSync('src/app/features/editor/shell/editor-shell.component.scss', 'utf8')),
    ).toContain('background: var(--workspace-sidebar-bg);');
    expect(
      String(
        readFileSync(
          'src/app/features/editor/shell/editor-status-bar/editor-status-bar.component.scss',
          'utf8',
        ),
      ),
    ).toContain('background: var(--workspace-header-bg);');
    expect(
      String(
        readFileSync(
          'src/app/features/editor/shell/editor-status-bar/editor-status-bar.component.scss',
          'utf8',
        ),
      ),
    ).toContain('outline: 2px solid var(--workspace-header-text);');
    expect(
      String(readFileSync('src/app/features/editor/shell/editor-shell.component.scss', 'utf8')),
    ).toContain('outline-color: var(--workspace-header-text);');
    expect(paletteStyles).not.toContain(":root[data-theme='craft'] {\n  --app-bg: #445449;");

    const sidebarConsumers = [
      [
        'src/app/features/editor/inspector/decoration-inspector/decoration-inspector.component.scss',
        '.field-label {',
      ],
      [
        'src/app/features/editor/inspector/sign-inspector/sign-inspector.component.scss',
        '.helper-text {',
      ],
      [
        'src/app/features/editor/inspector/decorated-pot-inspector/decorated-pot-inspector.component.scss',
        '.pot-patterns label {',
      ],
      [
        'src/app/features/editor/inspector/item-display-inspector/item-display-inspector.component.scss',
        '.item-slot {',
      ],
    ] as const;
    for (const [path, selector] of sidebarConsumers) {
      const componentStyles = String(readFileSync(path, 'utf8'));
      const start = componentStyles.indexOf(selector);
      const end = componentStyles.indexOf('}', start);
      expect(start, `${path} ${selector}`).toBeGreaterThanOrEqual(0);
      expect(componentStyles.slice(start, end)).toContain('color: var(--workspace-sidebar-text);');
    }
  });

  it('keeps menu triggers and floating-surface content in separate color scopes', () => {
    const shellStyles = String(
      readFileSync('src/app/features/editor/shell/editor-shell.component.scss', 'utf8'),
    );
    const globalStyles = String(readFileSync('src/styles.scss', 'utf8'));
    const dropdownStyles = String(
      readFileSync(
        'src/app/shared/ui/searchable-dropdown/searchable-dropdown.component.scss',
        'utf8',
      ),
    );

    expect(shellStyles).toContain('.app-menus > .menu-entry > .app-menu-trigger {');
    expect(shellStyles).toContain('.app-menu-row > .brand {');
    expect(shellStyles).toContain('color: var(--workspace-header-text);');
    const headerRuleStart = shellStyles.lastIndexOf('.shell-header {');
    const headerRuleEnd = shellStyles.indexOf('}', headerRuleStart);
    const headerRule = shellStyles.slice(headerRuleStart, headerRuleEnd);
    expect(headerRule).toContain('background: var(--workspace-header-bg);');
    expect(headerRule).toContain('color: var(--workspace-header-text);');
    expect(headerRule).not.toContain('background: var(--surface);');
    expect(shellStyles).not.toContain('.app-menu-row .app-menus button');
    expect(shellStyles).not.toContain('.app-menus button');
    expect(globalStyles).not.toContain(":root[data-theme='craft'] .app-menus button");
    expect(globalStyles).not.toContain(":root[data-theme='craft'] .menu-popover button.active");
    expect(globalStyles).not.toContain(":root[data-theme='craft'] .shell-header .brand");
    expect(globalStyles).toContain(":root[data-theme='craft'] app-editor-shell .menu-popover");
    expect(globalStyles).not.toContain(":root[data-theme='craft'] .dropdown-popover");
    expect(globalStyles).toContain(
      ":root[data-theme='craft']:has(app-editor-shell) .cdk-overlay-container .dropdown-popover",
    );
    expect(shellStyles).toContain('color: var(--workspace-header-text);');

    const popoverStart = shellStyles.indexOf('.menu-popover {');
    const popoverEnd = shellStyles.indexOf('}', popoverStart);
    const popoverRule = shellStyles.slice(popoverStart, popoverEnd);
    expect(popoverRule).toContain('background: var(--surface);');
    expect(popoverRule).toContain('color: var(--text);');

    const itemStart = shellStyles.indexOf('.menu-popover button {');
    const itemEnd = shellStyles.indexOf('}', itemStart);
    const itemRule = shellStyles.slice(itemStart, itemEnd);
    expect(itemRule).toContain('background: transparent;');
    expect(itemRule).toContain('color: var(--text);');
    expect(shellStyles).toContain('.menu-popover button:hover:not(:disabled)');
    expect(shellStyles).toContain(".menu-popover button[aria-selected='true']");
    expect(shellStyles).toContain('.menu-popover button:disabled');
    expect(shellStyles).toContain('.menu-popover button.menu-danger-action:hover:not(:disabled)');
    expect(shellStyles).toContain('background: var(--surface-hover);');
    expect(shellStyles).toContain('color: var(--control-selected-text);');
    expect(shellStyles).toContain('color: var(--text-disabled);');
    expect(shellStyles).toContain('background: var(--button-danger-bg);');
    expect(globalStyles).toContain('outline: 2px solid var(--focus-color, var(--accent));');
    expect(
      String(
        readFileSync(
          'src/app/features/editor/shell/editor-status-bar/editor-status-bar.component.scss',
          'utf8',
        ),
      ),
    ).toContain('outline: 2px solid var(--workspace-header-text);');

    const dropdownTriggerStart = dropdownStyles.indexOf('.dropdown-trigger {');
    const dropdownTriggerEnd = dropdownStyles.indexOf('}', dropdownTriggerStart);
    expect(dropdownStyles.slice(dropdownTriggerStart, dropdownTriggerEnd)).toContain(
      'color: var(--text);',
    );
    expect(dropdownStyles).toContain('.dropdown-trigger:focus-visible');
    expect(dropdownStyles).toContain('outline: 2px solid var(--focus-color, var(--accent));');
    expect(dropdownStyles).toContain('.dropdown-trigger:disabled');
    const dropdownPopoverStart = dropdownStyles.indexOf('.dropdown-popover {');
    const dropdownPopoverEnd = dropdownStyles.indexOf('}', dropdownPopoverStart);
    expect(dropdownStyles.slice(dropdownPopoverStart, dropdownPopoverEnd)).toContain(
      'color: var(--text);',
    );
  });

  it('keeps the quick Settings menu limited to non-font preferences', () => {
    const shellTemplate = String(
      readFileSync('src/app/features/editor/shell/editor-shell.component.html', 'utf8'),
    );
    const settingsTemplate = String(
      readFileSync(
        'src/app/features/editor/settings/settings-dialog/settings-dialog.component.html',
        'utf8',
      ),
    );
    const popoverStart = shellTemplate.indexOf('<div class="menu-popover settings-popover"');
    const popoverEnd = shellTemplate.indexOf('</div>', popoverStart);
    const settingsPopover = shellTemplate.slice(popoverStart, popoverEnd);

    expect(settingsPopover).not.toContain('chooseFont(');
    expect(settingsPopover).not.toContain("i18n.t('comfortaa')");
    expect(settingsPopover).not.toContain("i18n.t('chakraPetch')");
    expect(settingsPopover).not.toContain("i18n.t('pangolin')");
    expect(settingsTemplate).toContain('[options]="fontOptions()"');
    expect(settingsTemplate).toContain('(selectionChange)="setFont($any($event))"');
  });

  it('keeps interactive text, focus, danger, and status combinations accessible', () => {
    const stylesheet = String(readFileSync('src/styles.scss', 'utf8'));
    const designContract = String(
      readFileSync('../Docs/design/workspace-color-palette.md', 'utf8'),
    );
    const paletteStyles = stylesheet.slice(stylesheet.indexOf('/* Workspace Palette V1'));
    const themeNames = ['craft', 'light', 'raccoon', 'dark'] as const;
    const paletteRows = new Map<string, readonly string[]>();
    for (const row of designContract
      .split(/\r?\n/)
      .filter((line) => /^\|\s*[^|]+\s*\|\s*#/.test(line))) {
      const [role, ...colors] = row
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim());
      paletteRows.set(role, colors);
    }

    for (const [themeIndex, themeName] of themeNames.entries()) {
      const value = (role: string): string => paletteRows.get(role)![themeIndex].toLowerCase();
      const header = value('Header / Status bar');
      const headerText = value('Header Text');
      const panel = value('Panel / Dialog');
      const raised = value('Input / Raised');
      const muted = value('Surface Muted');
      const hover = value('Surface Hover');
      const selected = value('Selected Surface');
      const text = value('Primary Text');
      const secondaryText = value('Secondary Text');
      const primary = value('Primary / Accent');
      const primaryHover = value('Primary Hover');
      const textOnPrimary = value('Text on Primary');
      const focus = value('Focus / Outline');
      const block = paletteStyles.match(
        new RegExp(`:root\\[data-theme='${themeName}'\\]\\s*\\{([^}]+)\\}`),
      )![1];

      for (const [label, foreground, background] of [
        ['panel body', text, panel],
        ['panel secondary', secondaryText, panel],
        ['header', headerText, header],
        ['sidebar', value('Sidebar Text'), value('Sidebar')],
        ['selected', text, selected],
        ['secondary control', text, muted],
        ['hover secondary control', text, hover],
        ['primary button', textOnPrimary, primary],
        ['primary hover', textOnPrimary, primaryHover],
        ['danger button', textOnPrimary, value('Danger / Error')],
      ] as const) {
        expect(
          contrastRatio(foreground, background),
          `${themeName} ${label}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(focus, raised), `${themeName} focus boundary`).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(focus, panel), `${themeName} focus on panel`).toBeGreaterThanOrEqual(3);

      for (const [statusRole, token] of [
        ['Success', '--workspace-status-valid'],
        ['Warning', '--workspace-status-warning'],
        ['Danger / Error', '--workspace-status-danger'],
        ['Info', '--workspace-status-info'],
      ] as const) {
        const statusAlias = block.match(new RegExp(`${token}:\\s*([^;]+);`))![1];
        const mix = statusAlias.match(/color-mix\(\s*in srgb,\s*var\([^)]*\)\s*(\d+)%/);
        const foreground = mix
          ? mixColors(value(statusRole), headerText, Number(mix[1]))
          : value(statusRole);
        expect(
          contrastRatio(foreground, header),
          `${themeName} ${statusRole} on header`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(value(statusRole), panel),
          `${themeName} ${statusRole} on panel`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('ThemeService font state', () => {
  afterEach(() => localStorage.removeItem(preferencesKey));

  beforeEach(() => {
    localStorage.removeItem(preferencesKey);
    TestBed.configureTestingModule({ providers: [ThemeService, UiPreferencesService] });
  });

  it('uses Comfortaa by default and applies the root font attribute', () => {
    const theme = TestBed.inject(ThemeService);
    const document = TestBed.inject(DOCUMENT);
    TestBed.flushEffects();
    expect(theme.font()).toBe('comfortaa');
    expect(document.documentElement.dataset['font']).toBe('comfortaa');
    expect(document.documentElement.style.getPropertyValue('--font-ui')).toContain('Comfortaa');
  });

  it('keeps Craft and base theme changes from changing the font choice', () => {
    const theme = TestBed.inject(ThemeService);
    const document = TestBed.inject(DOCUMENT);
    theme.setPreset('craft');
    TestBed.flushEffects();
    expect(document.documentElement.dataset['font']).toBe('comfortaa');
    theme.setPreset('light');
    TestBed.flushEffects();
    expect(document.documentElement.dataset['font']).toBe('comfortaa');
    theme.setFont('chakra-petch');
    TestBed.flushEffects();
    expect(document.documentElement.dataset['font']).toBe('chakra-petch');
    expect(document.documentElement.style.getPropertyValue('--font-ui')).toContain('Chakra Petch');
    theme.setPreset('dark');
    TestBed.flushEffects();
    expect(document.documentElement.dataset['font']).toBe('chakra-petch');
  });

  it('supports every theme and font independently without changing the workspace background', () => {
    const theme = TestBed.inject(ThemeService);
    const preferences = TestBed.inject(UiPreferencesService);
    const document = TestBed.inject(DOCUMENT);
    const themes = ['craft', 'light', 'raccoon', 'dark'] as const;
    const fonts = ['comfortaa', 'chakra-petch', 'pangolin'] as const;
    const familyNames = ['Comfortaa', 'Chakra Petch', 'Pangolin'] as const;

    theme.setEditorBackground('light');
    for (const preset of themes) {
      theme.setPreset(preset);
      TestBed.flushEffects();
      expect(document.documentElement.dataset['theme']).toBe(preset);
      expect(preferences.preferences().appearance.editorBackground).toBe('light');
      for (const [index, font] of fonts.entries()) {
        theme.setFont(font);
        TestBed.flushEffects();
        expect(theme.font()).toBe(font);
        expect(document.documentElement.dataset['font']).toBe(font);
        expect(document.documentElement.style.getPropertyValue('--font-ui')).toContain(
          familyNames[index],
        );
      }
    }
    expect(document.documentElement.style.getPropertyValue('--editor-viewport-bg')).toBe('#e3e8ee');
  });

  it('applies custom legacy theme appearance through its selected base', () => {
    const theme = TestBed.inject(ThemeService);
    const preferences = TestBed.inject(UiPreferencesService);
    const document = TestBed.inject(DOCUMENT);
    preferences.setAppearance({ preset: 'custom', base: 'light' });
    TestBed.flushEffects();
    expect(theme.selectedPreset()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
