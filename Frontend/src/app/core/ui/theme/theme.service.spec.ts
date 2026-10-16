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
  it('marks the selected tab surface without a detached or moving indicator', () => {
    const stylesheet = String(readFileSync('src/styles.scss', 'utf8'));
    expect(stylesheet).not.toContain('.ui-tab-strip::before');
    expect(stylesheet).not.toContain(".ui-tab-strip > [role='tab'][aria-selected='true']::after");
    expect(stylesheet).toContain(".ui-tab-strip > [role='tab'][aria-selected='true']");
    expect(stylesheet).toContain('background: var(--control-selected);');
  });

  it('matches the approved 92 colors and keeps generic tokens workspace-scoped', () => {
    const stylesheet = String(readFileSync('src/styles.scss', 'utf8'));
    const designContract = String(
      readFileSync('../Docs/design/workspace-color-palette.md', 'utf8'),
    );
    const paletteStyles = stylesheet.slice(stylesheet.indexOf('/* Workspace V2 palette'));
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
    const shellStyles = String(
      readFileSync('src/app/features/editor/shell/editor-shell.component.scss', 'utf8'),
    );
    const chromeStyles = String(
      readFileSync('src/app/features/editor/shell/editor-chrome.component.scss', 'utf8'),
    );
    expect(chromeStyles).toContain('background: var(--workspace-header-bg);');
    expect(chromeStyles).toContain('color: var(--workspace-header-text);');
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
    expect(shellStyles).toContain('outline: 2px solid var(--workspace-header-text);');
    expect(paletteStyles).not.toContain(":root[data-theme='craft'] {\n  --app-bg: #35372f;");

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
    const chromeStyles = String(
      readFileSync('src/app/features/editor/shell/editor-chrome.component.scss', 'utf8'),
    );
    const globalStyles = String(readFileSync('src/styles.scss', 'utf8'));
    const dropdownStyles = String(
      readFileSync(
        'src/app/shared/ui/searchable-dropdown/searchable-dropdown.component.scss',
        'utf8',
      ),
    );

    expect(chromeStyles).toContain('.app-menu-trigger {');
    expect(chromeStyles).toContain('.brand {');
    expect(chromeStyles).toContain('color: var(--workspace-header-text);');
    const headerRuleStart = chromeStyles.indexOf('.shell-header {');
    const headerRuleEnd = chromeStyles.indexOf('}', headerRuleStart);
    const headerRule = chromeStyles.slice(headerRuleStart, headerRuleEnd);
    expect(headerRule).toContain('background: var(--workspace-header-bg);');
    expect(headerRule).toContain('color: var(--workspace-header-text);');
    expect(headerRule).not.toContain('background: var(--surface);');
    expect(chromeStyles).not.toContain('.app-menu-row .app-menus button');
    expect(chromeStyles).not.toContain('.app-menus button');
    expect(globalStyles).not.toContain(":root[data-theme='craft'] .app-menus button");
    expect(globalStyles).not.toContain(":root[data-theme='craft'] .menu-popover button.active");
    expect(globalStyles).not.toContain(":root[data-theme='craft'] .shell-header .brand");
    expect(globalStyles).toContain(":root[data-theme='craft'] app-editor-shell .menu-popover");
    expect(globalStyles).not.toContain(":root[data-theme='craft'] .dropdown-popover");
    expect(globalStyles).toContain(
      ":root[data-theme='craft']:has(app-editor-shell) .cdk-overlay-container .dropdown-popover",
    );
    expect(chromeStyles).toContain('color: var(--workspace-header-text);');

    const popoverStart = chromeStyles.indexOf('.menu-popover {');
    const popoverEnd = chromeStyles.indexOf('}', popoverStart);
    const popoverRule = chromeStyles.slice(popoverStart, popoverEnd);
    expect(popoverRule).toContain('background: var(--surface);');
    expect(popoverRule).toContain('color: var(--text);');

    const itemStart = chromeStyles.indexOf('.menu-popover button {');
    const itemEnd = chromeStyles.indexOf('}', itemStart);
    const itemRule = chromeStyles.slice(itemStart, itemEnd);
    expect(itemRule).toContain('background: transparent;');
    expect(itemRule).toContain('color: var(--text);');
    expect(chromeStyles).toContain('.menu-popover button:hover:not(:disabled)');
    expect(chromeStyles).toContain(".menu-popover button[aria-checked='true']");
    expect(chromeStyles).toContain('.menu-popover button:disabled');
    expect(chromeStyles).toContain('.menu-popover button.menu-danger-action:hover:not(:disabled)');
    expect(chromeStyles).toContain('background: var(--control-hover);');
    expect(chromeStyles).toContain('color: var(--control-selected-text);');
    expect(chromeStyles).toContain('color: var(--text-disabled);');
    expect(chromeStyles).toContain('color: var(--danger);');
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

  it('derives shared Workspace shape and elevation from the active theme', () => {
    const stylesheet = String(readFileSync('src/styles.scss', 'utf8'));
    const shellStyles = String(
      readFileSync('src/app/features/editor/shell/editor-shell.component.scss', 'utf8'),
    );
    const expectedRadii = {
      craft: '0.125rem',
      light: '0.25rem',
      raccoon: '0.625rem',
      dark: '0.25rem',
    } as const;

    for (const [theme, radius] of Object.entries(expectedRadii)) {
      const themeStyles = stylesheet
        .slice(stylesheet.indexOf('/* Workspace V2 palette'))
        .match(new RegExp(`:root\\[data-theme='${theme}'\\]\\s*\\{([^}]+)\\}`))?.[1];
      expect(themeStyles, `${theme} shape tokens`).toContain(`--workspace-radius-sm: ${radius};`);
      expect(themeStyles).toContain('--workspace-shadow-control-raised:');
      expect(themeStyles).toContain('--workspace-shadow-popover:');
    }

    expect(stylesheet).toContain('--radius-sm: var(--workspace-radius-sm);');
    expect(shellStyles).not.toContain('border-radius: 4px;');
  });

  it('keeps Minecraft dropdowns in the same stone control system as buttons', () => {
    const stylesheet = String(readFileSync('src/styles.scss', 'utf8'));
    const blockStyles = String(
      readFileSync('src/app/features/editor/blocks/block-browser.component.scss', 'utf8'),
    );

    expect(stylesheet).toContain(":root[data-theme='craft'] app-editor-shell :where(select)");
    expect(stylesheet).toContain('appearance: none;');
    expect(stylesheet).toContain('background-color: var(--workspace-raised);');
    expect(stylesheet).toContain('border-bottom-width: 2px;');
    expect(stylesheet).toContain('--workspace-control-frame-strong: #817c69;');
    expect(blockStyles).toContain('border: 1px solid var(--workspace-border);');
    expect(blockStyles).toContain('.block-browser input:focus-visible');
  });

  it('keeps the Minecraft toolbar dirt-brown with readable dark controls', () => {
    const stylesheet = String(readFileSync('src/styles.scss', 'utf8'));
    const chromeStyles = String(
      readFileSync('src/app/features/editor/shell/editor-chrome.component.scss', 'utf8'),
    );
    const paletteStyles = stylesheet.slice(stylesheet.indexOf('/* Workspace V2 palette'));
    const craftTheme = paletteStyles.match(/:root\[data-theme='craft'\]\s*\{([^}]+)\}/)?.[1];
    const toolbarBackground = craftTheme?.match(
      /--workspace-toolbar-bg:\s*(#[0-9A-Fa-f]{6});/,
    )?.[1];
    const toolbarText = craftTheme?.match(/--workspace-toolbar-text:\s*(#[0-9A-Fa-f]{6});/)?.[1];

    expect(toolbarBackground?.toLowerCase()).toBe('#b9956b');
    expect(toolbarText).toBeDefined();
    expect(contrastRatio(toolbarText!, toolbarBackground!)).toBeGreaterThanOrEqual(4.5);
    expect(craftTheme).toContain('--workspace-segment-idle-text-mix: 100%;');
    expect(chromeStyles).toContain('box-shadow: inset 0 -2px var(--workspace-secondary-accent);');
    expect(chromeStyles).toContain(
      'background: color-mix(in srgb, var(--workspace-toolbar-bg) 78%, white);',
    );
  });

  it('keeps interactive text, focus, danger, and status combinations accessible', () => {
    const stylesheet = String(readFileSync('src/styles.scss', 'utf8'));
    const designContract = String(
      readFileSync('../Docs/design/workspace-color-palette.md', 'utf8'),
    );
    const paletteStyles = stylesheet.slice(stylesheet.indexOf('/* Workspace V2 palette'));
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
        const panelForeground =
          themeName === 'craft' && statusRole === 'Success'
            ? mixColors(value(statusRole), '#000000', 98)
            : value(statusRole);
        expect(
          contrastRatio(panelForeground, panel),
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
    expect(document.documentElement.style.getPropertyValue('--font-ui')).toBe(
      "'Comfortaa Variable'",
    );
  });

  it('bundles each approved face and applies its exact family without platform fallbacks', () => {
    const buildConfig = String(readFileSync('angular.json', 'utf8'));
    const fontFaces = [
      {
        font: 'comfortaa',
        package: '@fontsource-variable/comfortaa',
        css: 'node_modules/@fontsource-variable/comfortaa/index.css',
        family: "'Comfortaa Variable'",
        face: "font-family: 'Comfortaa Variable';",
      },
      {
        font: 'chakra-petch',
        package: '@fontsource/chakra-petch',
        css: 'node_modules/@fontsource/chakra-petch/index.css',
        family: "'Chakra Petch'",
        face: "font-family: 'Chakra Petch';",
      },
      {
        font: 'pangolin',
        package: '@fontsource/pangolin',
        css: 'node_modules/@fontsource/pangolin/index.css',
        family: "'Pangolin'",
        face: "font-family: 'Pangolin';",
      },
    ] as const;
    const theme = TestBed.inject(ThemeService);
    const document = TestBed.inject(DOCUMENT);

    for (const fontFace of fontFaces) {
      expect(buildConfig).toContain(fontFace.css);
      expect(String(readFileSync(fontFace.css, 'utf8'))).toContain(fontFace.face);
      theme.setFont(fontFace.font);
      TestBed.flushEffects();
      expect(document.documentElement.style.getPropertyValue('--font-ui')).toBe(fontFace.family);
      expect(document.documentElement.style.getPropertyValue('--font-readable')).toBe(
        fontFace.family,
      );
    }

    expect(String(readFileSync(fontFaces[1].css, 'utf8'))).toContain(
      'chakra-petch-vietnamese-400-normal',
    );
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
    const familyNames = ["'Comfortaa Variable'", "'Chakra Petch'", "'Pangolin'"] as const;

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
        expect(document.documentElement.style.getPropertyValue('--font-ui')).toBe(
          familyNames[index],
        );
      }
    }
    expect(document.documentElement.style.getPropertyValue('--editor-viewport-bg')).toBe('#e3e8ee');
  });

  it('persists Reality as an editor background independently of the application theme', () => {
    const theme = TestBed.inject(ThemeService);
    const preferences = TestBed.inject(UiPreferencesService);
    const document = TestBed.inject(DOCUMENT);
    theme.setPreset('raccoon');
    theme.setEditorBackground('reality');
    TestBed.flushEffects();
    expect(theme.theme()).toBe('raccoon');
    expect(theme.editorBackground()).toBe('reality');
    expect(preferences.preferences().appearance.reality).toEqual({
      groundPreset: 'plains-grass',
      skyPreset: 'overworld-day',
    });
    expect(document.documentElement.dataset['editorBackground']).toBe('reality');
    expect(document.documentElement.style.getPropertyValue('--editor-viewport-bg')).toBe('#8bc8e7');
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
