// "Build with AI" beside the trajectory editor (Phase 7): a drawer with the stages, the sources, the conversation, the brief the AI summarised and
// the module cards. Everything the AI says is shown as text. It only reads from vm.tai (trajectoryAiVals.ts); nothing here changes the trajectory.
import { Banner, Button, ChatBubble, Drawer, LinkButton, Stepper, Textarea } from '../ds';
import type { Tai } from '../trajectoryAiVals';
import AiMadeTag from './AiMadeTag';
import { BundlePicker } from './CreateParts';
import { Problems } from './CreateShared';
import { label } from './labelStyle';
import PlanApply from './PlanApply';
import PlanModules from './PlanModules';
import PlanSources from './PlanSources';

const NOTICE = 'Nothing changes the trajectory until you press Apply.';
const section = { display: 'flex', flexDirection: 'column' as const, gap: 8 };

function Conversation({ tai }: { tai: Tai }) {
  return (
    <div style={section}>
      <span style={label}>Conversation</span>
      <div role="log" aria-label="Conversation with the AI" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
        {!tai.messages.length && <div style={{ fontSize: 12, color: '#8b918a' }}>Say what the trajectory is for. The AI asks at most three questions, then summarises the brief.</div>}
        {tai.messages.map((m) => (
          <div key={m.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <ChatBubble role={m.mine ? 'user' : 'assistant'} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {m.about && <div style={{ fontSize: 11.5, opacity: 0.75 }}>About {m.about}</div>}{m.text}
            </ChatBubble>
            {m.notes.map((n) => <div key={n} role="alert" style={{ fontSize: 12, color: '#7a5000' }}>{n}</div>)}
          </div>
        ))}
        {tai.busy && <div role="status" style={{ fontSize: 12.5, color: '#5a6058' }}>The AI is working</div>}
      </div>
      {tai.canEdit && !tai.off && (
        <>
          {tai.focusTitle && <div style={{ fontSize: 12.5 }}>About <b>{tai.focusTitle}</b> · <LinkButton tone="muted" onClick={tai.clearFocus}>Ask about the whole plan</LinkButton></div>}
          <Textarea minHeight={64} maxLength={4000} aria-label="Message to the AI" placeholder="Tell the AI about the trajectory, or what to change" value={tai.say} onChange={tai.setSay} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button size="sm" onClick={tai.send} disabled={tai.working || !tai.say.trim()}>Send</Button>
            {tai.canPropose && <Button size="sm" variant="secondary" onClick={tai.propose} disabled={tai.working}>Propose the plan</Button>}
          </div>
        </>
      )}
    </div>
  );
}

function Brief({ tai }: { tai: Tai }) {
  if (!tai.brief) return null;
  return (
    <div style={{ ...section, padding: 12, border: '1px solid #e1e5dc', borderRadius: 6, background: '#fafbf8' }}>
      <span style={label}>The AI&apos;s summary of the brief</span>
      {tai.brief.map((r) => <div key={r.label} style={{ fontSize: 12.5 }}><span style={{ color: '#5a6058' }}>{r.label} · </span>{r.value}</div>)}
      {tai.canEdit && <div style={{ fontSize: 12, color: '#5a6058' }}>Correct it in the chat.</div>}
    </div>
  );
}

export default function TrajectoryAi({ tai }: { tai: Tai }) {
  return (
    <Drawer title="Build with AI" subtitle={tai.name} onClose={tai.close} width={560} scrim="none">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><AiMadeTag on /><span style={{ fontSize: 12.5, color: '#3d423b' }}>Proposed by AI · from your sources only · you decide</span></div>
      <div style={{ fontSize: 12.5, color: '#5a6058' }}>{NOTICE}</div>
      <Stepper steps={tai.stages} current={tai.stage} />
      {tai.off && <Banner tone="warning">{tai.off}</Banner>}
      <Problems list={tai.error ? [tai.error] : []} />
      {tai.loading ? <div role="status" style={{ fontSize: 12.5, color: '#5a6058' }}>Loading the plan</div> : (
        <>
          <PlanSources p={tai.sources} />
          {tai.canEdit && <div style={section}><span style={label}>Knowledge bundles</span><BundlePicker c={tai.picker} /></div>}
          <Conversation tai={tai} />
          <Brief tai={tai} />
          <PlanModules tai={tai} />
          <Problems list={tai.problems} />
          {tai.canEdit && <PlanApply a={tai.apply} />}
          {tai.canEdit && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {tai.startOver.confirm ? (
                <>
                  <span style={{ fontSize: 12.5 }}>This clears the plan and the conversation. Your sources stay.</span>
                  <Button size="sm" variant="dark" onClick={tai.startOver.run} disabled={tai.working}>Yes, start over</Button>
                  <LinkButton tone="muted" onClick={tai.startOver.cancel}>Cancel</LinkButton>
                </>
              ) : <Button size="sm" variant="secondary" onClick={tai.startOver.run} disabled={tai.working}>Start over</Button>}
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}
