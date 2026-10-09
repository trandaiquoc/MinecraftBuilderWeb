import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nService } from './i18n.service';
import { supplementalTranslations, translationCatalogs, translationKeySets } from './translation-catalogs';

afterEach(() => localStorage.removeItem('minecraft-builder.ui-preferences'));

describe('translation dictionaries', () => {
  it('keep exact English and Vietnamese key parity', () => {
    expect(translationKeySets.en).toEqual(translationKeySets.vi);
  });

  it('keeps every catalog complete, disjoint, and interpolation-compatible', () => {
    const owners = new Map<string, string>();
    for (const [catalogName, catalog] of Object.entries(translationCatalogs)) {
      const en = catalog.en as Readonly<Record<string, string>>;
      const vi = catalog.vi as Readonly<Record<string, string>>;
      expect(Object.keys(en).sort(), `${catalogName} EN/VI key parity`).toEqual(Object.keys(vi).sort());
      for (const key of Object.keys(en)) {
        expect(owners.has(key), `${key} has a single catalog owner`).toBe(false);
        owners.set(key, catalogName);
        const placeholders = (value: string) => [...value.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).sort();
        expect(placeholders(vi[key]), `${catalogName}.${key} interpolation parity`).toEqual(placeholders(en[key]));
      }
    }
  });

  it('keeps supplemental Vietnamese UI text readable and localized', () => {
    const values = Object.values(supplementalTranslations.vi);
    const mojibake = /Ãƒ|Ã„|Ã†|Ã‚|Ã¡Âº|Ã¡Â»/;
    expect(Object.keys(supplementalTranslations.en).sort()).toEqual(Object.keys(supplementalTranslations.vi).sort());
    expect(values.some((value) => mojibake.test(value))).toBe(false);
    expect(supplementalTranslations.vi.assetManagerTabVanilla).toBe('Phiên bản Minecraft');
    expect(supplementalTranslations.vi.assetManagerShowTechnicalProgress).toBe('Hiện tiến trình kỹ thuật');
  });

  it('keeps Structure JSON diagnostic labels and reasons localized in both locales', () => {
    expect(supplementalTranslations.en.structureJsonPosition).toBe('Position');
    expect(supplementalTranslations.en.structureJsonReasonMissingBlock).toContain('Block');
    expect(supplementalTranslations.vi.structureJsonPosition).toBe('Vị trí');
    expect(supplementalTranslations.vi.structureJsonProperty).toBe('Thuộc tính');
    expect(supplementalTranslations.vi.structureJsonReasonOutOfBounds).toContain('Tọa độ');
    expect(supplementalTranslations.vi.structureJsonReasonUnsupportedStateValue).toContain('Giá trị');
  });

  it('provides localized viewport hydration labels', () => {
    expect(supplementalTranslations.en.importingStructure).toBe('Importing structure');
    expect(supplementalTranslations.en.buildingStructure).toBe('Building structure');
    expect(supplementalTranslations.vi.importingStructure).toBe('Đang nhập cấu trúc');
    expect(supplementalTranslations.vi.buildingStructure).toBe('Đang dựng cấu trúc');
  });

  it('uses project backup terminology consistently in both locales', () => {
    const service = TestBed.inject(I18nService);
    service.setLocale('en');
    expect(service.t('importProjectPackage')).toBe('Import Project Backup…');
    expect(service.t('exportProjectPackage')).toBe('Export Project Backup…');
    expect(service.t('exportStructureNbt')).toBe('Export Minecraft Structure (NBT)…');
    service.setLocale('vi');
    expect(service.t('importProjectPackage')).toBe('Nhập bản sao lưu dự án…');
    expect(service.t('exportProjectPackage')).toBe('Xuất bản sao lưu dự án…');
    expect(service.t('exportStructureNbt')).toBe('Xuất cấu trúc Minecraft (NBT)…');
    service.setLocale('en');
  });

  it('serves Structure JSON copy from catalogs without changing visible wording', () => {
    const service = TestBed.inject(I18nService);
    service.setLocale('en');
    expect(service.t('structureJsonCurrentFormat')).toBe('MinecraftBuilder Structure JSON');
    expect(service.t('structureJsonLimitations')).toBe('Structure JSON includes blocks, decorations, and verified semantic block entities. Unsupported opaque data may require Project Backup for full fidelity.');
    expect(service.t('structureJsonImportStale')).toBe('The project changed while this import was waiting. Validate again before applying.');
    expect(service.t('structureJsonImportDescription')).toBe('Paste or load the current Structure JSON format to inspect it before any project changes.');
    expect(service.t('structureJsonValidationShape')).toBe('The document does not match the current Structure JSON shape.');
    service.setLocale('vi');
    expect(service.t('structureJsonLimitations')).toBe('Structure JSON bao gom block, do trang tri va block entity semantic da xac minh. Du lieu raw khong duoc ho tro co the can Ban sao luu du an de giu nguyen.');
    expect(service.t('structureJsonImportDescription')).toBe('Dán hoặc tải Structure JSON hiện tại để kiểm tra trước khi thay đổi dự án.');
    service.setLocale('en');
  });

  it('localizes recent-project mode and metadata labels in both locales', () => {
    const service = TestBed.inject(I18nService);
    service.setLocale('en');
    expect(service.t('recentProjectVanilla')).toBe('Vanilla');
    expect(service.t('recentProjectSize')).toBe('Size');
    service.setLocale('vi');
    expect(service.t('recentProjectHuge')).toBe('Huge');
    expect(service.t('recentProjectUpdated')).toBe('Cập nhật');
    service.setLocale('en');
  });

  it('localizes the Huge Structure Blocks guidance in both locales', () => {
    const service = TestBed.inject(I18nService);
    service.setLocale('en');
    expect(service.t('vanillaCompatible')).toContain('Vanilla');
    expect(service.t('hugeStructureBlocksModrinth')).toBe('View on Modrinth');
    expect(service.t('hugeStructureBlocksResources')).toBe('Huge Structure Blocks resources');
    expect(service.t('autoUseHugeStructureBlocksDescription')).toContain('48 blocks');
    expect(service.t('hugeStructureBlocksStepInstall')).toContain('{version}');
    service.setLocale('vi');
    expect(service.t('vanillaCompatible')).toContain('vanilla');
    expect(service.t('hugeStructureBlocksModrinth')).toBe('Xem trên Modrinth');
    expect(service.t('hugeStructureBlocksResources')).toBe('Tài nguyên Huge Structure Blocks');
    expect(service.t('autoUseHugeStructureBlocksDescription')).toContain('48 khối');
    service.setLocale('en');
  });

  it('localizes known diagnostics and preserves unknown fallback text', () => {
    const service = TestBed.inject(I18nService);
    service.setLocale('vi');
    expect(service.modDiagnostic('nested-jar-skipped', 'raw', { count: 8 })).toContain('8');
    expect(service.modDiagnostic('custom-model-loader', 'raw')).not.toBe('raw');
    expect(service.modDiagnostic('minecraft-version-incompatible', 'raw')).not.toBe('raw');
    expect(service.modDiagnostic('resource-conflict', 'raw')).not.toBe('raw');
    expect(service.modDiagnostic('block-id-conflict', 'raw')).not.toBe('raw');
    expect(service.modDiagnostic('unsupported-minecraft-predicate', 'raw')).not.toBe('raw');
    expect(service.modDiagnostic('future-code', 'Original diagnostic')).toBe('Original diagnostic');
  });

  it('keeps domain labels translated without changing unknown canonical values', () => {
    const service = TestBed.inject(I18nService);
    service.setLocale('vi');
    expect(service.stateProperty('facing')).toBe('Hướng');
    expect(service.stateValue('inner_left')).toBe('Góc trong trái');
    expect(service.signColorLabel('light_blue')).toBe('Xanh nhạt');
    expect(service.supportLevel('partial')).toBe('Một phần');
    expect(service.stateValue('custom_value')).toBe('custom_value');
    service.setLocale('en');
    expect(service.stateProperty('waterlogged')).toBe('Waterlogged');
    expect(service.visualSupport('real')).toBe('Real');
  });
});
