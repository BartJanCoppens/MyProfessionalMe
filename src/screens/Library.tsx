import type { CSSProperties } from 'react';
import { Avatar, Banner, Button, Card, Checkbox, Eyebrow, Field, FilterChip, Hover, Input, KeyValueList, LinkButton, PageTitle, PillToggle, ProgressRing, SegmentedControl, Select, StatusChip, Tag, Textarea } from '../ds';
import type { VM } from '../model';
import { AvatarBadge } from './Map';
import { CoverArt } from './Cover';

export function LibraryScreen({ vm }: { vm: VM }) {
  return (
    <>
      <PageTitle title="Library" lead={vm.libLead} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: '1 1 240px', maxWidth: 320 }}><Input placeholder="Search title, source or topic" value={vm.libQ} onChange={vm.setLibQ} /></div>
        <SegmentedControl options={vm.obOptions} value={vm.libOb} onChange={vm.setLibOb} size="lg" />
        <Select options={vm.levelOptions} value={vm.libLevel} onChange={vm.setLibLevel} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(112px,1fr))', gap: 8 }}>
        {vm.fmtTiles.map((ft) => (
          <Hover key={ft.key} as="button" type="button" onClick={ft.pick} hoverStyle={{ transform: 'translateY(-2px)', borderColor: '#1a1d18' }}
            style={{ textAlign: 'left', borderRadius: 6, border: '1px solid ' + ft.bd, background: ft.bg, color: ft.fg, padding: '9px 11px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 2, transition: 'transform .15s,border-color .15s' }}>
            <span style={{ fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap' }}>{ft.label}</span>
            <span style={{ fontSize: 11.5, opacity: 0.75 }}>{ft.count}</span>
          </Hover>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {vm.domChips.map((dc) => <FilterChip key={dc.key} selected={dc.on} onClick={dc.onClick}>{dc.label}</FilterChip>)}
      </div>
      {vm.showReels && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><span style={{ fontWeight: 600, fontSize: 14 }}>Quick learning</span><span style={{ fontSize: 12, color: '#5a6058' }}>{vm.reelSub}</span></div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '3px 3px 6px' }}>
            {vm.reelStrip.map((rl) => (
              <Hover key={rl.id} onClick={rl.open} hoverStyle={{ boxShadow: '0 0 0 3px rgba(134,188,37,.45)' }}
                style={{ flex: 'none', width: 128, aspectRatio: '9/16', borderRadius: 6, background: '#171a16', color: '#fff', padding: 10, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer', transition: 'box-shadow .15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, padding: '1px 7px', borderRadius: 999, background: 'rgba(255,255,255,.1)' }}>{rl.len}</span>
                  {rl.done && <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#86BC25', color: '#10180a', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>}
                </div>
                <div style={{ alignSelf: 'center', width: 38, height: 38, borderRadius: '50%', border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, paddingLeft: 2 }}>▶</div>
                <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.25, textWrap: 'pretty' }}>{rl.title}</div><div style={{ fontSize: 10.5, color: '#a9b0a5', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rl.by}</div></div>
              </Hover>
            ))}
          </div>
        </div>
      )}
      <div style={{ fontSize: 12.5, color: '#5a6058' }}>{vm.libResultText}</div>
      {vm.libEmpty && (
        <div style={{ background: '#fff', border: '1px dashed #c8cdc3', borderRadius: 6, padding: '18px 20px', color: '#5a6058' }}>
          <div style={{ fontWeight: 600, color: '#1a1d18', marginBottom: 2 }}>No learnings match these filters</div>
          Try another format or domain, or <LinkButton onClick={vm.clearLibFilters}>clear all filters</LinkButton>.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
        {vm.libItems.map((it) => (
          <Hover key={it.id} onClick={it.open} hoverStyle={{ borderColor: '#b9bfb5', transform: 'translateY(-2px)' }}
            style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, display: 'flex', flexDirection: 'column', cursor: 'pointer', overflow: 'hidden', transition: 'transform .15s,border-color .15s', animation: 'pmFadeUp .35s ease-out backwards', animationDelay: it.cardDelay }}>
            <CoverArt cv={it} title={it.title} avInit={it.avInit} />
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Eyebrow tone="muted" size={11}>{it.domLabel} · {it.format}</Eyebrow>
              <Tag tone={it.obTone}>{it.obLabel}</Tag>
            </div>
            <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.25, textWrap: 'pretty' }}>{it.title}</div>
            <div style={{ fontSize: 12.5, color: '#5a6058' }}>{it.meta}</div>
            {it.isAvatar && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 5, background: '#f3f5f0', minWidth: 0 }}>
                <AvatarBadge initials={it.avInit} size={24} ring="#f3f5f0" />
                <span style={{ fontSize: 12, color: '#3d423b', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.avWith}</span>
              </div>
            )}
            {it.isMedia && <div style={{ fontSize: 12, color: '#3d423b' }}>{it.mediaLine}</div>}
            {it.isPeer && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#3f6a0a', fontWeight: 500 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#86BC25', flex: 'none' }} />{it.peerLine}</div>}
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <StatusChip status={it.state} label={it.stateLabel} icon={it.stateIcon} />
              <span style={{ fontSize: 12, color: it.dueColor, fontWeight: 500 }}>{it.dueLabel}</span>
            </div>
            </div>
          </Hover>
        ))}
      </div>
    </>
  );
}

export function DetailScreen({ vm }: { vm: VM }) {
  const det = vm.det;
  return (
    <>
      <div><LinkButton onClick={vm.goBack}>{vm.backLabel}</LinkButton></div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <Eyebrow>{det.domLabel} · {det.format} · {det.source}</Eyebrow>
          <h1 style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 600, lineHeight: 1.2, textWrap: 'pretty' }}>{det.title}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Tag tone={det.obTone}>{det.obLabel}</Tag>
          <StatusChip status={det.state} label={det.stateLabel} icon={det.stateIcon} size="md" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 600px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {vm.rec.changes && (
            <Banner tone="warning" title={vm.rec.changes.title}>
              <div style={{ textWrap: 'pretty' }}>{vm.rec.changes.comment}</div>
              {vm.rec.changes.hint && <div style={{ marginTop: 4, fontSize: 12 }}>{vm.rec.changes.hint}</div>}
            </Banner>
          )}
          <Card title="Why this is on your path"><p style={{ margin: 0, textWrap: 'pretty', maxWidth: 640 }}>{det.why}</p></Card>
          {vm.rec.showEvidence && <EvidenceCard rec={vm.rec} />}
          {vm.rec.hasHistory && <RecordCard rec={vm.rec} />}
          {det.pod && <PodcastPlayer pod={det.pod} />}
          {det.reel && <ReelViewer reel={det.reel} />}
          {det.av && <AvatarPractice av={det.av} counsellorFirst={vm.counsellorFirst} />}
          {vm.done.quiz && <QuizCard quiz={vm.done.quiz} />}
          {vm.done.feedback && <FeedbackCard fb={vm.done.feedback} />}
          {vm.done.attendance && <AttendanceCard att={vm.done.attendance} />}
          {det.hasSugg && (
            <Card title="Suggested by" subtitle={det.suggSub}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {det.sugg.map((sg, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: sg.color, flex: 'none', marginTop: 5 }} />
                    <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, color: '#8b918a' }}>{sg.src}</div><div style={{ textWrap: 'pretty' }}>{sg.text}</div></div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          <Card title="What you will be able to do">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {det.outcomes.map((o) => (
                <div key={o.t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" style={{ flex: 'none', marginTop: 2 }}><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="#86BC25" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span>{o.t}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Level" subtitle={det.levelSub}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 6 }}>
              {det.ladder.map((c) => (
                <div key={c.n} style={{ border: '1px solid ' + c.bd, background: c.bg, color: c.fg, borderRadius: 6, padding: '8px 10px', minHeight: 54 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase' }}>L{c.n}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{c.label}</div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>{c.note}</div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Colleague notes" subtitle={det.rating}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {det.notes.map((nt) => (
                <div key={nt.who} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <Avatar initials={nt.initials} />
                  <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, color: '#8b918a' }}>{nt.who}</div><div style={{ textWrap: 'pretty' }}>{nt.text}</div></div>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div style={{ flex: '0 1 300px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <ProgressRing value={det.frac} size={56} stroke={6} />
              <div><div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2 }}>{det.hoursDone}</div><div style={{ fontSize: 12, color: '#5a6058' }}>{det.hoursText}</div></div>
            </div>
            <KeyValueList rows={det.kv} labelWidth={96} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
              {vm.rec.decide && <DecideBox decide={vm.rec.decide} />}
              {det.canAdd && <Button size="xl" fullWidth onClick={vm.addToPath}>+ Add to my path</Button>}
              {det.canLog && <Button size="xl" fullWidth onClick={vm.logHours}>Log 1 hour</Button>}
              {vm.done.mark && <Button size="xl" variant={det.canLog ? 'secondary' : 'primary'} fullWidth disabled={vm.done.mark.disabled} onClick={vm.done.mark.run}>{vm.done.mark.label}</Button>}
              {det.canAsk && <Button size="xl" variant="secondary" fullWidth disabled={!!vm.rec.problem} onClick={vm.askApprove}>{vm.rec.submitLabel}</Button>}
              {det.canAsk && vm.rec.problem && <div style={{ fontSize: 12, color: '#7a5000', textWrap: 'pretty' }}>{vm.rec.problem}</div>}
              {vm.rec.submittedLine && <div style={{ fontSize: 12, color: '#5a6058' }}>{vm.rec.submittedLine}</div>}
            </div>
            <div style={{ fontSize: 12, color: '#8b918a', textWrap: 'pretty' }}>{det.approvalNote}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontWeight: 600 }}>Where it sits on paths</div>
            {det.paths.map((p) => (
              <div key={p.bl} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, paddingTop: 6, borderTop: '1px solid #eef0ea' }}>
                <span>{p.bl} · {p.stage}</span><span style={{ color: '#5a6058' }}>{p.ob}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

type Rec = VM['rec'];
const linkStyle = { color: '#2f6fa8', overflowWrap: 'anywhere' } as const;

// Evidence: the learner's form while the learning is open; read-only for the learner once accepted and for whoever views it.
function EvidenceCard({ rec }: { rec: Rec }) {
  if (!rec.editable) {
    return (
      <Card title="Evidence">
        <EvidenceList ev={rec.saved} />
      </Card>
    );
  }
  return (
    <Card title="Evidence for acceptance" subtitle={rec.ruleText}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label={rec.noteLabel} hint={rec.noteCount}>
          <Textarea value={rec.note} onChange={rec.setNote} minHeight={88} placeholder="What you took from it, and where you will use it" />
        </Field>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Link" style={{ flex: '2 1 260px' }}><Input value={rec.link} onChange={rec.setLink} placeholder="https://… (SharePoint, OneDrive, provider page)" /></Field>
          {rec.showRef && <Field label="Certificate number" style={{ flex: '1 1 160px' }}><Input value={rec.ref} onChange={rec.setRef} placeholder="e.g. AZ900-12345" /></Field>}
        </div>
        <div style={{ fontSize: 12, color: '#8b918a', textWrap: 'pretty' }}>{rec.linkedNote}</div>
        <div><Button variant="secondary" disabled={!rec.dirty} onClick={rec.save}>Save evidence</Button></div>
      </div>
    </Card>
  );
}

function EvidenceList({ ev }: { ev: Rec['saved'] }) {
  if (ev.none) return <div style={{ color: '#5a6058' }}>{ev.none}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {ev.note && <div style={{ whiteSpace: 'pre-wrap', textWrap: 'pretty' }}>{ev.note}</div>}
      {ev.link && <div><a href={ev.link} target="_blank" rel="noopener noreferrer" style={linkStyle}>{ev.link}</a></div>}
      {ev.ref && <div style={{ fontSize: 12.5, color: '#5a6058' }}>Certificate number · {ev.ref}</div>}
    </div>
  );
}

// The acceptance record: every decision on this learning, newest first.
function RecordCard({ rec }: { rec: Rec }) {
  return (
    <Card title="Acceptance record">
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {rec.history.map((h, i) => (
          <div key={h.key} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0,1fr)', gap: 10, padding: '8px 0', borderTop: i ? '1px solid #eef0ea' : 0, fontSize: 12.5 }}>
            <span style={{ color: '#8b918a' }}>{h.date}</span>
            <div style={{ minWidth: 0 }}>
              <Tag tone={h.tone}>{h.label}</Tag>
              {h.comment && <div style={{ marginTop: 4, textWrap: 'pretty' }}>{h.comment}</div>}
              {h.evidence && <div style={{ marginTop: 2, fontSize: 11.5, color: '#5a6058' }}>Decided on: {h.evidence}</div>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DecideBox({ decide }: { decide: NonNullable<Rec['decide']> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Field label="Comment" hint={decide.hint} size="sm">
        <Textarea value={decide.comment} onChange={decide.setComment} minHeight={64} placeholder="What is good, or what should change" />
      </Field>
      <div style={{ fontSize: 11.5, color: '#8b918a', textAlign: 'right' }}>{decide.commentCount}</div>
      <Button size="xl" fullWidth onClick={decide.accept}>Accept</Button>
      <Button size="xl" variant="secondary" fullWidth onClick={decide.sendBack}>Request changes</Button>
    </div>
  );
}

function AvatarPractice({ av, counsellorFirst }: { av: NonNullable<VM['det']['av']>; counsellorFirst: string }) {
  return (
    <Card title="Practise with the avatar" subtitle={av.sub}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', width: 56, height: 56, borderRadius: '50%', background: '#1a1d18', color: '#fff', fontSize: 17, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            {av.initials}
            <span style={{ position: 'absolute', right: 0, bottom: 0, width: 14, height: 14, borderRadius: '50%', background: '#86BC25', border: '3px solid #fff', animation: 'pmDot 2.4s ease-in-out infinite' }} />
          </div>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{av.persona}</div>
            <div style={{ fontSize: 12.5, color: '#5a6058' }}>{av.role}</div>
            <p style={{ margin: '6px 0 0', textWrap: 'pretty' }}>{av.brief}</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button onClick={av.start}>Start a session</Button>
            {av.hasRuns && <LinkButton onClick={av.share}>Share best run with {counsellorFirst}</LinkButton>}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' }}>Best scores · the target is 4 of 5 on every skill</div>
          {av.skills.map((sk) => (
            <div key={sk.name} style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr) 44px', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
              <span>{sk.name}</span>
              <div style={{ position: 'relative', height: 8, borderRadius: 999, background: '#eef0ec' }}>
                <div style={{ height: '100%', borderRadius: 999, width: sk.w, background: sk.color, transition: 'width .3s' }} />
                <div style={{ position: 'absolute', top: -3, bottom: -3, left: sk.tgt, width: 2, background: '#1a1d18' }} />
              </div>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#5a6058' }}>{sk.val}</span>
            </div>
          ))}
        </div>
        {av.hasRuns && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {av.runs.map((rn) => (
              <div key={rn.date} style={{ display: 'grid', gridTemplateColumns: '90px minmax(0,1fr)', gap: 10, padding: '8px 0', borderTop: '1px solid #eef0ea', fontSize: 12.5 }}>
                <span style={{ color: '#8b918a' }}>{rn.date}</span>
                <div style={{ minWidth: 0 }}><div style={{ textWrap: 'pretty' }}>{rn.note}</div><div style={{ fontSize: 11.5, color: '#5a6058' }}>{rn.scores}</div></div>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 12, color: '#8b918a', textWrap: 'pretty' }}>Runs are private until you share one. The avatar scores the conversation; your counsellor sees scores and the transcript, never the recording.</div>
      </div>
    </Card>
  );
}

const caps: CSSProperties = { fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' };
// A fieldset that disables every control inside it (View as, rows already completed), without a frame of its own.
const bare: CSSProperties = { border: 0, padding: 0, margin: 0, minWidth: 0 };
type Done = VM['done'];

// Avatar practice: the evaluation quiz after the session. Three right answers complete the learning.
function QuizCard({ quiz }: { quiz: NonNullable<Done['quiz']> }) {
  return (
    <Card title="Evaluation quiz" subtitle={quiz.lead}>
      {!quiz.done && (
        <fieldset disabled={quiz.disabled} style={bare}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {quiz.items.map((qi) => (
              <div key={qi.q} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontWeight: 600, textWrap: 'pretty' }}>{qi.q}</div>
                {qi.opts.map((o) => (
                  <Hover key={o.label} as="button" type="button" onClick={o.pick} aria-pressed={o.picked} hoverStyle={{ borderColor: '#1a1d18' }}
                    style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 6, border: '1px solid ' + o.bd, background: o.bg, color: '#1a1d18', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>{o.label}</Hover>
                ))}
                {qi.wrong && <div style={{ fontSize: 12.5, color: '#9a2b22', fontWeight: 500 }}>Not quite. Think about what this person needs from you here.</div>}
              </div>
            ))}
            {quiz.hasResult && <div style={{ fontSize: 13, color: quiz.resultColor, fontWeight: 500, textWrap: 'pretty' }}>{quiz.result}</div>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {!quiz.checked && <Button disabled={!quiz.canCheck} onClick={quiz.check}>Check my answers</Button>}
              {quiz.checked && !quiz.passed && <Button variant="secondary" onClick={quiz.retry}>Try again</Button>}
            </div>
          </div>
        </fieldset>
      )}
    </Card>
  );
}

// Classroom: the learner's feedback completes it (a rating and what they will apply); read-only once given.
function FeedbackCard({ fb }: { fb: NonNullable<Done['feedback']> }) {
  if (!fb.open) {
    return (
      <Card title="Your feedback on the session">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div><Tag tone="green">{fb.given?.rating}</Tag></div>
          <div style={{ whiteSpace: 'pre-wrap', textWrap: 'pretty' }}>{fb.given?.text}</div>
        </div>
      </Card>
    );
  }
  return (
    <Card title="Feedback on the session" subtitle={fb.lead}>
      <fieldset disabled={fb.disabled} style={bare}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="How useful was the session? (1 = not at all, 5 = very)">
            <div><SegmentedControl options={fb.ratingOptions} value={fb.rating} onChange={fb.setRating} size="md" /></div>
          </Field>
          <Field label="What will you apply?" hint={fb.count}>
            <Textarea value={fb.text} onChange={fb.setText} minHeight={88} placeholder="One thing you will do differently, and where" />
          </Field>
          <div><Button disabled={fb.disabled || !!fb.problem} onClick={fb.send}>Send feedback and complete</Button></div>
          {fb.problem && <div style={{ fontSize: 12, color: '#7a5000', textWrap: 'pretty' }}>{fb.problem}</div>}
        </div>
      </fieldset>
    </Card>
  );
}

// Classroom attendance (admins): tick who attended; registering completes the learning for them.
function AttendanceCard({ att }: { att: NonNullable<Done['attendance']> }) {
  return (
    <Card title="Attendance" subtitle={att.lead} extra={att.summary ? <span style={{ fontSize: 12, color: '#5a6058' }}>{att.summary}</span> : undefined}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {att.notLoaded && <div><Button variant="secondary" onClick={att.load}>Show the people you can register</Button></div>}
        {att.loading && <div style={{ color: '#5a6058' }}>Loading the people you can register…</div>}
        {att.error && (
          <Banner tone="warning" title="The list did not load">
            <div>{att.error}</div>
            <div style={{ marginTop: 6 }}><LinkButton onClick={att.retry}>Try again</LinkButton></div>
          </Banner>
        )}
        {att.showSearch && <div style={{ maxWidth: 320 }}><Input placeholder="Search name or business line" value={att.q} onChange={att.setQ} /></div>}
        {att.rows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 320, overflowY: 'auto' }}>
            {att.rows.map((r, i) => (
              <fieldset key={r.userId} disabled={r.locked} style={{ ...bare, padding: '8px 0', borderTop: i ? '1px solid #eef0ea' : 0 }}>
                <Checkbox checked={r.ticked} onChange={r.toggle}>
                  <span style={{ fontWeight: 500 }}>{r.name}</span> <span style={{ fontSize: 12, color: '#5a6058' }}>{r.sub}</span>
                </Checkbox>
              </fieldset>
            ))}
          </div>
        )}
        {att.empty && <div style={{ color: '#5a6058' }}>{att.empty}</div>}
        {!att.notLoaded && !att.loading && !att.error && (
          <div><Button disabled={!att.canSave} onClick={att.save}>{att.busy ? 'Registering…' : 'Register attendance'}</Button></div>
        )}
        <div style={{ fontSize: 12, color: '#8b918a', textWrap: 'pretty' }}>Registering completes the classroom for each person ticked, without a counsellor. Someone already completed stays as they are.</div>
      </div>
    </Card>
  );
}

function PodcastPlayer({ pod }: { pod: NonNullable<VM['det']['pod']> }) {
  return (
    <Card title="Listen" subtitle={pod.sub}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Hover as="button" type="button" onClick={pod.toggle} title={pod.playTitle} hoverStyle={{ background: '#78aa1e' }}
            style={{ width: 48, height: 48, borderRadius: '50%', border: 0, background: '#86BC25', color: '#10180a', fontSize: 15, cursor: 'pointer', flex: 'none', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{pod.playIcon}</Hover>
          <div style={{ flex: '1 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 6, borderRadius: 999, background: '#eef0ec', overflow: 'hidden' }}><div style={{ height: '100%', width: pod.w, background: '#1a1d18', transition: 'width .25s linear' }} /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#5a6058', fontVariantNumeric: 'tabular-nums' }}><span>{pod.time}</span><span>{pod.left}</span></div>
          </div>
          <PillToggle options={pod.speedOptions} value={pod.speed} onChange={pod.setSpeed} size="xs" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...caps, paddingBottom: 4 }}>Chapters</div>
          {pod.chapters.map((ch) => (
            <Hover key={ch.t} onClick={ch.seek} hoverStyle={{ background: '#fafbf8' }}
              style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr)', gap: 10, padding: '8px 6px', borderTop: '1px solid #eef0ea', cursor: 'pointer', borderRadius: 4, fontWeight: ch.fw }}>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#5a6058' }}>{ch.t}</span><span>{ch.title}</span>
            </Hover>
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#8b918a', textWrap: 'pretty' }}>{pod.note}</div>
      </div>
    </Card>
  );
}

function ReelViewer({ reel }: { reel: NonNullable<VM['det']['reel']> }) {
  return (
    <Card title="Watch" subtitle={reel.sub}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div onClick={reel.toggle} style={{ flex: 'none', width: 210, aspectRatio: '9/16', borderRadius: 6, background: '#171a16', color: '#fff', position: 'relative', overflow: 'hidden', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '14px 12px 16px' }}>
          <div style={{ position: 'absolute', left: 8, right: 8, top: 6, height: 3, borderRadius: 999, background: 'rgba(255,255,255,.16)', overflow: 'hidden' }}><div style={{ height: '100%', width: reel.w, background: '#86BC25', transition: 'width .25s linear' }} /></div>
          <div style={{ fontSize: 11, color: '#a9b0a5', marginTop: 6 }}>{reel.by}</div>
          <div style={{ alignSelf: 'center', width: 54, height: 54, borderRadius: '50%', border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{reel.playIcon}</div>
          <div key={reel.caption} style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, textWrap: 'pretty', animation: 'pmFadeUp .3s ease-out' }}>{reel.caption}</div>
        </div>
        <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><div style={caps}>The one takeaway</div><p style={{ margin: '4px 0 0', textWrap: 'pretty' }}>{reel.takeaway}</p></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={caps}>Check yourself · completes the reel</div>
            <div style={{ fontWeight: 600, textWrap: 'pretty' }}>{reel.q}</div>
            {reel.opts.map((ro) => (
              <Hover key={ro.label} as="button" type="button" onClick={ro.pick} hoverStyle={{ borderColor: '#1a1d18' }}
                style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 6, border: '1px solid ' + ro.bd, background: ro.bg, color: '#1a1d18', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>{ro.label}</Hover>
            ))}
            {reel.hasFb && <div style={{ fontSize: 12.5, color: reel.fbColor, fontWeight: 500 }}>{reel.fb}</div>}
          </div>
        </div>
      </div>
    </Card>
  );
}
