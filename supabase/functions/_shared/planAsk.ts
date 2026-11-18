// What one Trajectory AI call may hold, shared by the app (src/logic/planPrompt.ts builds the request within it) and the `ai` function
// (readAsk refuses a trajectory_ai request over it). One number, so neither side can drift.
// budgetChars: system and messages together (the use's preamble comes on top and is metered, not counted here).
// history: the last messages of the conversation sent with a request. maxTokens: the answer.
export const PLAN_ASK = { budgetChars: 50_000, history: 12, maxTokens: 4000 } as const;
