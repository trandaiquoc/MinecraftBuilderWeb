import type { Locale } from './translation-catalogs';

type LocalizedPair = readonly [english: string, vietnamese: string];
type DomainLabelDictionary = Readonly<Record<string, LocalizedPair>>;

export const statePropertyTranslations: DomainLabelDictionary = {
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
};

export const stateValueTranslations: DomainLabelDictionary = {
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
};

export const signColorTranslations: DomainLabelDictionary = {
  white: ['White', 'Trắng'], orange: ['Orange', 'Cam'], magenta: ['Magenta', 'Tím hồng'], light_blue: ['Light blue', 'Xanh nhạt'], yellow: ['Yellow', 'Vàng'], lime: ['Lime', 'Xanh lá sáng'], pink: ['Pink', 'Hồng'], gray: ['Gray', 'Xám'], light_gray: ['Light gray', 'Xám nhạt'], cyan: ['Cyan', 'Xanh lơ'], purple: ['Purple', 'Tím'], blue: ['Blue', 'Xanh dương'], brown: ['Brown', 'Nâu'], green: ['Green', 'Xanh lá'], red: ['Red', 'Đỏ'], black: ['Black', 'Đen'],
};

export const supportLevelTranslations: DomainLabelDictionary = {
  full: ['Full', 'Đầy đủ'],
  partial: ['Partial', 'Một phần'],
  fallback: ['Fallback', 'Dự phòng'],
  unknown: ['Unknown', 'Chưa xác định'],
};

export const behaviorSupportTranslations: DomainLabelDictionary = {
  full: ['Full', 'Đầy đủ'],
  partial: ['Partial', 'Một phần'],
  unknown: ['Unknown', 'Chưa xác định'],
};

export const visualSupportTranslations: DomainLabelDictionary = {
  real: ['Real', 'Thật'],
  partial: ['Partial', 'Một phần'],
  fallback: ['Fallback', 'Dự phòng'],
};

export function translateDomainLabel(value: string, locale: Locale, dictionary: DomainLabelDictionary): string {
  return dictionary[value]?.[locale === 'en' ? 0 : 1] ?? value;
}
