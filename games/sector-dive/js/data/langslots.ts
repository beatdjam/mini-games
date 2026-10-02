// Definitions get their "(lang)" fields (names, descriptions) from the language file at setLang (js/system/text.ts).
// withLang gives each entry an empty value for them first, so the fields are always there in the type and
// reading one before the language is set gives '' instead of undefined. fillData then overwrites them.
export function withLang<T, K extends keyof T>(table: Record<string, Omit<T, K>>, blank: Pick<T, K>): Record<string, T>;
export function withLang<T, K extends keyof T>(table: Omit<T, K>[], blank: Pick<T, K>): T[];
export function withLang(table: any, blank: any): any {
  if (Array.isArray(table)) return table.map(o => ({ ...blank, ...o }));
  return Object.fromEntries(Object.entries(table).map(([k, o]) => [k, { ...blank, ...(o as object) }]));
}
