// The feedback line after an answer: a coloured left rule, an optional bold head and the explanation. The question round (QuestionRound.tsx) and the course
// blocks (CoursePlay.tsx) show it.
import type { ReactNode } from 'react';

export default function Feedback({ color, head, role, children }: { color: string; head?: string; role?: 'status'; children?: ReactNode }) {
  return <div role={role} style={{ borderLeft: '3px solid ' + color, padding: '6px 10px', fontSize: 12.5, color: '#3d423b', textWrap: 'pretty' }}>{head && <span style={{ fontWeight: 600, color }}>{head} </span>}{children}</div>;
}
