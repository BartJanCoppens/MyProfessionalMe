// A studio's rows, in a file of their own: gameContent.ts needs them while studios.ts (which re-exports them) is still
// loading, because items.ts imports gameContent.ts and studios.ts reads items.ts at load.
export type StudioItem = [label: string, text: string] | [label: string, text: string, text2: string];
export const stepsOf = (items: readonly unknown[]) => items.filter((i): i is StudioItem => Array.isArray(i));
