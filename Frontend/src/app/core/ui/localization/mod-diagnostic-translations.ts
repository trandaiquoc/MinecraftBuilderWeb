import type { Locale } from './translation-catalogs';

type DiagnosticTemplates = Readonly<Record<string, readonly [english: string, vietnamese: string]>>;

const templates: DiagnosticTemplates = {
  'unsafe-archive-path': [
    'Skipped an archive path that is not safe to retain.',
    'Đã bỏ qua đường dẫn lưu trữ không an toàn để giữ lại.',
  ],
  'nested-jar-skipped': [
    'Skipped {count} nested JAR file(s); embedded Mod code is never executed.',
    'Đã bỏ qua {count} JAR lồng nhau; MinecraftBuilder không bao giờ thực thi mã Mod.',
  ],
  'unsupported-loader': [
    'This Mod loader is detected but is not supported yet.',
    'Đã phát hiện loader của Mod nhưng chưa được hỗ trợ.',
  ],
  'malformed-json': [
    'A JSON resource is malformed and was skipped.',
    'Một tài nguyên JSON không hợp lệ nên đã được bỏ qua.',
  ],
  'custom-model-loader': [
    'A custom model loader was retained but is not executed.',
    'Đã giữ loader model tùy biến nhưng không thực thi.',
  ],
  'minecraft-version-incompatible': [
    'The declared Minecraft compatibility excludes the selected project version.',
    'Tương thích Minecraft đã khai báo không bao gồm phiên bản dự án đang chọn.',
  ],
  'missing-minecraft-dependency': [
    'Minecraft dependency is missing, so compatibility cannot be verified.',
    'Thiếu dependency Minecraft nên không thể xác minh tương thích.',
  ],
  'resource-conflict': [
    'A retained resource conflicts with an active content source.',
    'Một tài nguyên được giữ lại xung đột với nguồn nội dung đang hoạt động.',
  ],
  'tag-replacement-unsupported': [
    'Tag replacement is preserved but cannot be applied without an explicit load-order policy.',
    'Đã giữ thay thế tag nhưng chưa thể áp dụng nếu chưa có chính sách thứ tự tải rõ ràng.',
  ],
  'block-conflict': [
    'A block is already provided by an active content source.',
    'Một khối đã được cung cấp bởi nguồn nội dung đang hoạt động.',
  ],
  'item-conflict': [
    'An item is already provided by an active content source.',
    'Một vật phẩm đã được cung cấp bởi nguồn nội dung đang hoạt động.',
  ],
  'decoration-conflict': [
    'A decoration is already provided by an active content source.',
    'Một nội dung trang trí đã được cung cấp bởi nguồn nội dung đang hoạt động.',
  ],
  'malformed-minecraft-dependency': [
    'The Minecraft dependency declaration is malformed.',
    'Khai bao dependency Minecraft khong hop le.',
  ],
  'unsupported-project-version': [
    'The selected project version cannot be compared with this requirement.',
    'Khong the doi chieu phien ban du an dang chon voi yeu cau nay.',
  ],
  'unsupported-minecraft-predicate': [
    'The Minecraft version predicate is not supported.',
    'Bieu thuc phien ban Minecraft chua duoc ho tro.',
  ],
  'declared-predicate-excludes-version': [
    'The declared Minecraft requirement excludes the selected project version.',
    'Yeu cau Minecraft da khai bao khong bao gom phien ban du an dang chon.',
  ],
};

const aliases: Readonly<Record<string, string>> = {
  'block-id-conflict': 'block-conflict',
  'item-id-conflict': 'item-conflict',
  'decoration-id-conflict': 'decoration-conflict',
};

export function translateModDiagnostic(
  code: string,
  fallback: string,
  parameters: Readonly<Record<string, string | number>>,
  locale: Locale,
): string {
  const template = templates[aliases[code] ?? code]?.[locale === 'en' ? 0 : 1] ?? fallback;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(parameters[key] ?? `{${key}}`));
}
