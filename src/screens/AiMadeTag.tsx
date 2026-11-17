// "Made with AI" on a learning AI made (learnings.ai_made): the one label, on the library card and the learning's page.
import { Tag } from '../ds';
import { AI_MADE } from '../logic/provenance';

export default function AiMadeTag({ on }: { on: boolean }) {
  return on ? <Tag tone="blue">{AI_MADE}</Tag> : null;
}
