import type { FieldMeta } from '../types';

/**
 * 标准化字段名
 * - 统一小写
 * - 去除空格
 * - 去除emoji和特殊符号
 */
export function normalizeFieldName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/[💵💰🔧📝📦]/g, '');
}

/**
 * 匹配单个字段
 * @param requiredName 需要匹配的字段名
 * @param availableFields 可用字段列表
 * @returns 匹配成功返回字段ID，否则返回null
 */
export function matchField(
  requiredName: string,
  availableFields: FieldMeta[]
): string | null {
  const normalizedRequired = normalizeFieldName(requiredName);
  const matched = availableFields.find(
    f => normalizeFieldName(f.name) === normalizedRequired
  );
  return matched?.id || null;
}

/**
 * 批量匹配模板字段
 */
export interface MatchResult {
  matchedIds: string[];
  missingFields: string[];
}

export function matchTemplateFields(
  requiredFields: string[],
  optionalFields: string[],
  availableFields: FieldMeta[]
): MatchResult {
  const matchedIds: string[] = [];
  const missingFields: string[] = [];

  for (const name of requiredFields) {
    const id = matchField(name, availableFields);
    if (id) {
      matchedIds.push(id);
    } else {
      missingFields.push(name);
    }
  }

  for (const name of optionalFields) {
    const id = matchField(name, availableFields);
    if (id) {
      matchedIds.push(id);
    }
  }

  return { matchedIds, missingFields };
}
