// The value checks every store and reader of untyped data (jsonb, parsed files) uses, kept once.
export const isText = (v: unknown): v is string => typeof v === 'string';
export const isTexts = (v: unknown): v is string[] => Array.isArray(v) && v.every(isText);
export const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
