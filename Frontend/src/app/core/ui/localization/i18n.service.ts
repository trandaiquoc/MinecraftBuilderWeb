import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject } from '@angular/core';
import { UiPreferencesService, UiLocale } from '../preferences/ui-preferences.service';
import {
  BehaviorSupportLevel,
  BlockSupportLevel,
  VisualSupportLevel,
} from '../../blocks/catalog/block-definition.types';

import { supplementalTranslations, structureExportUiTranslations, structureJsonValidationTranslations, translationKeySets, translations } from './translation-catalogs';
import type { Locale, TranslationKey } from './translation-catalogs';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly document = inject(DOCUMENT);
  private readonly preferences = inject(UiPreferencesService);
  readonly locale = computed<Locale>(() => this.preferences.preferences().locale);

  constructor() { this.applyLocale(this.locale()); }

  t(key: TranslationKey | string): string {
    const locale = this.locale();
    const exportTranslation = structureExportUiTranslations[locale][key as keyof typeof structureExportUiTranslations.en];
    if (exportTranslation) return exportTranslation;
    const validationTranslation = structureJsonValidationTranslations[locale][key];
    if (validationTranslation) return validationTranslation;
    if (key === 'structureJsonCurrentFormat') return locale === 'en' ? 'MinecraftBuilder Structure JSON' : 'Structure JSON MinecraftBuilder';
    if (key === 'structureJsonLimitations') return locale === 'en' ? 'Structure JSON includes blocks, decorations, and verified semantic block entities. Unsupported opaque data may require Project Backup for full fidelity.' : 'Structure JSON bao gom block, do trang tri va block entity semantic da xac minh. Du lieu raw khong duoc ho tro co the can Ban sao luu du an de giu nguyen.';
    if (key === 'structureJsonImportStale') return locale === 'en' ? 'The project changed while this import was waiting. Validate again before applying.' : 'Dự án đã thay đổi trong khi chờ nhập. Hãy kiểm tra lại trước khi áp dụng.';
    if (key === 'structureJsonImportDescription') return locale === 'en' ? 'Paste or load the current Structure JSON format to inspect it before any project changes.' : 'Dán hoặc tải Structure JSON hiện tại để kiểm tra trước khi thay đổi dự án.';
    if (key === 'structureJsonValidationShape') return locale === 'en' ? 'The document does not match the current Structure JSON shape.' : 'Tai lieu khong dung cau truc Structure JSON hien tai.';
    return (translations[locale] as Record<string, string>)[key] ?? supplementalTranslations[locale][key as keyof typeof supplementalTranslations[typeof locale]] ?? key;
  }

  toggleLocale(): void {
    this.setLocale(this.locale() === 'en' ? 'vi' : 'en');
  }

  setLocale(locale: UiLocale): void {
    this.preferences.setLocale(locale);
    this.applyLocale(locale);
  }

  private applyLocale(locale: Locale): void {
    this.document.documentElement.lang = locale;
  }

  stateProperty(value: string): string {
    return this.stateToken(value, {
      facing: ['Facing', 'Hướng'],
      half: ['Half', 'Nửa'],
      shape: ['Shape', 'Hình dạng'],
      waterlogged: ['Waterlogged', 'Ngập nước'],
      open: ['Open', 'Mở'],
      powered: ['Powered', 'Có tín hiệu'],
      hinge: ['Hinge', 'Bản lề'],
      axis: ['Axis', 'Trục'],
      rotation: ['Rotation', 'Góc xoay'],
      occupied: ['Occupied', 'Đang sử dụng'],
      part: ['Part', 'Phần'],
      attached: ['Attached', 'Đã gắn'],
    });
  }
  stateValue(value: string): string {
    return this.stateToken(value, {
      north: ['North', 'Bắc'],
      south: ['South', 'Nam'],
      east: ['East', 'Đông'],
      west: ['West', 'Tây'],
      top: ['Top', 'Trên'],
      bottom: ['Bottom', 'Dưới'],
      upper: ['Upper', 'Trên'],
      lower: ['Lower', 'Dưới'],
      straight: ['Straight', 'Thẳng'],
      inner_left: ['Inner left', 'Góc trong trái'],
      inner_right: ['Inner right', 'Góc trong phải'],
      outer_left: ['Outer left', 'Góc ngoài trái'],
      outer_right: ['Outer right', 'Góc ngoài phải'],
      left: ['Left', 'Trái'],
      right: ['Right', 'Phải'],
      true: ['True', 'Có'],
      false: ['False', 'Không'],
    });
  }
  signColorLabel(value: string): string {
    return this.stateToken(value, {
      white: ['White', 'Trắng'], orange: ['Orange', 'Cam'], magenta: ['Magenta', 'Tím hồng'], light_blue: ['Light blue', 'Xanh nhạt'], yellow: ['Yellow', 'Vàng'], lime: ['Lime', 'Xanh lá sáng'], pink: ['Pink', 'Hồng'], gray: ['Gray', 'Xám'], light_gray: ['Light gray', 'Xám nhạt'], cyan: ['Cyan', 'Xanh lơ'], purple: ['Purple', 'Tím'], blue: ['Blue', 'Xanh dương'], brown: ['Brown', 'Nâu'], green: ['Green', 'Xanh lá'], red: ['Red', 'Đỏ'], black: ['Black', 'Đen'],
    });
  }
  supportLevel(value: BlockSupportLevel | 'unknown'): string {
    return this.stateToken(value, {
      full: ['Full', 'Đầy đủ'],
      partial: ['Partial', 'Một phần'],
      fallback: ['Fallback', 'Dự phòng'],
      unknown: ['Unknown', 'Chưa xác định'],
    });
  }
  behaviorSupport(value: BehaviorSupportLevel): string {
    return this.stateToken(value, {
      full: ['Full', 'Đầy đủ'],
      partial: ['Partial', 'Một phần'],
      unknown: ['Unknown', 'Chưa xác định'],
    });
  }
  visualSupport(value: VisualSupportLevel): string {
    return this.stateToken(value, {
      real: ['Real', 'Thật'],
      partial: ['Partial', 'Một phần'],
      fallback: ['Fallback', 'Dự phòng'],
    });
  }
  modDiagnostic(code: string, fallback: string, parameters: Readonly<Record<string, string | number>> = {}): string {
    const templates: Readonly<Record<string, readonly [string, string]>> = {
      'unsafe-archive-path': ['Skipped an archive path that is not safe to retain.', 'Đã bỏ qua đường dẫn lưu trữ không an toàn để giữ lại.'],
      'nested-jar-skipped': ['Skipped {count} nested JAR file(s); embedded Mod code is never executed.', 'Đã bỏ qua {count} JAR lồng nhau; MinecraftBuilder không bao giờ thực thi mã Mod.'],
      'unsupported-loader': ['This Mod loader is detected but is not supported yet.', 'Đã phát hiện loader của Mod nhưng chưa được hỗ trợ.'],
      'malformed-json': ['A JSON resource is malformed and was skipped.', 'Một tài nguyên JSON không hợp lệ nên đã được bỏ qua.'],
      'custom-model-loader': ['A custom model loader was retained but is not executed.', 'Đã giữ loader model tùy biến nhưng không thực thi.'],
      'minecraft-version-incompatible': ['The declared Minecraft compatibility excludes the selected project version.', 'Tương thích Minecraft đã khai báo không bao gồm phiên bản dự án đang chọn.'],
      'missing-minecraft-dependency': ['Minecraft dependency is missing, so compatibility cannot be verified.', 'Thiếu dependency Minecraft nên không thể xác minh tương thích.'],
      'resource-conflict': ['A retained resource conflicts with an active content source.', 'Một tài nguyên được giữ lại xung đột với nguồn nội dung đang hoạt động.'],
      'tag-replacement-unsupported': ['Tag replacement is preserved but cannot be applied without an explicit load-order policy.', 'Đã giữ thay thế tag nhưng chưa thể áp dụng nếu chưa có chính sách thứ tự tải rõ ràng.'],
      'block-conflict': ['A block is already provided by an active content source.', 'Một khối đã được cung cấp bởi nguồn nội dung đang hoạt động.'],
      'item-conflict': ['An item is already provided by an active content source.', 'Một vật phẩm đã được cung cấp bởi nguồn nội dung đang hoạt động.'],
      'decoration-conflict': ['A decoration is already provided by an active content source.', 'Một nội dung trang trí đã được cung cấp bởi nguồn nội dung đang hoạt động.'],
    };
    const aliases: Readonly<Record<string, string>> = {
      'block-id-conflict': 'block-conflict',
      'item-id-conflict': 'item-conflict',
      'decoration-id-conflict': 'decoration-conflict',
    };
    const additional: Readonly<Record<string, readonly [string, string]>> = {
      'malformed-minecraft-dependency': ['The Minecraft dependency declaration is malformed.', 'Khai bao dependency Minecraft khong hop le.'],
      'unsupported-project-version': ['The selected project version cannot be compared with this requirement.', 'Khong the doi chieu phien ban du an dang chon voi yeu cau nay.'],
      'unsupported-minecraft-predicate': ['The Minecraft version predicate is not supported.', 'Bieu thuc phien ban Minecraft chua duoc ho tro.'],
      'declared-predicate-excludes-version': ['The declared Minecraft requirement excludes the selected project version.', 'Yeu cau Minecraft da khai bao khong bao gom phien ban du an dang chon.'],
    };
    const template = { ...templates, ...additional }[aliases[code] ?? code]?.[this.locale() === 'en' ? 0 : 1] ?? fallback;
    return template.replace(/\{(\w+)\}/g, (_, key: string) => String(parameters[key] ?? `{${key}}`));
  }
  modDiagnosticGroup(kind: 'blocking' | 'warning' | 'info'): string { return kind === 'blocking' ? this.t('assetManagerBlocking') : kind === 'warning' ? this.t('assetManagerWarnings') : this.t('info'); }
  private stateToken(
    value: string,
    dictionary: Readonly<Record<string, readonly [string, string]>>,
  ): string {
    return dictionary[value]?.[this.locale() === 'en' ? 0 : 1] ?? value;
  }
}
