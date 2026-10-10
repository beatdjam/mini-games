// A game's definitions (weapons, enemies, ...) get their "(lang)" fields (names, descriptions) from the language file
// when the language is set (setLang and fillData in core/i18n.ts). withLang gives each entry an empty value for them
// first, so the fields are always there in the type and reading one before the language is set gives '' instead of
// undefined. It imports nothing, so a data file may call it while it loads.
export function withLang<T, K extends keyof T>(table: Record<string, Omit<T, K>>, blank: Pick<T, K>): Record<string, T>;
export function withLang<T, K extends keyof T>(table: Omit<T, K>[], blank: Pick<T, K>): T[];
export function withLang(table: any, blank: any): any {
  if (Array.isArray(table)) return table.map(o => ({ ...blank, ...o }));
  return Object.fromEntries(Object.entries(table).map(([k, o]) => [k, { ...blank, ...(o as object) }]));
}
