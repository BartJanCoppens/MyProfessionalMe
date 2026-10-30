import type { RefObject } from 'react';
import { Button, ChatBubble, Eyebrow, FilterChip, Hover, Input, LinkButton, PageTitle, PillToggle, Tag } from '../ds';
import type { VM } from '../model';
import { AvatarFace } from './AvatarFace';

type Props = { vm: VM; fileRef: RefObject<HTMLInputElement | null>; chatRef: RefObject<HTMLDivElement | null> };
const panelHead = { padding: '14px 18px', background: '#fafbf8' } as const;

export default function ProfileScreen({ vm, fileRef, chatRef }: Props) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <PageTitle title="My profile" lead={vm.profLead} />
        <Button variant="secondary" onClick={vm.addTest}>+ Add a test result</Button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, padding: '16px 18px', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: 76, height: 76, borderRadius: '50%', flex: 'none', padding: 4, border: '3px solid #86BC25' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: vm.avatarBg, color: vm.avatarFg, fontSize: 20, fontWeight: 600 }}>
            <AvatarFace vm={vm} fontSize={20} />
          </div>
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Avatar</div>
          <div style={{ fontSize: 12.5, color: '#5a6058', textWrap: 'pretty' }}>Shown in the middle of your growth map, on the radar and in the sidebar. Only you and your counsellor see it.</div>
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 70 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#5a6058' }}>Initials</span>
            <Input value={vm.avatarInitials} onChange={vm.setInitials} maxLength={2} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#5a6058' }}>Colour</span>
            <div style={{ display: 'flex', gap: 6, height: 34, alignItems: 'center' }}>
              {vm.avatarSwatches.map((sw) => (
                <button key={sw.bg} type="button" onClick={sw.pick} title={sw.label} aria-label={sw.label}
                  style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid #fff', background: sw.bg, boxShadow: sw.ring, cursor: 'pointer', padding: 0 }} />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', height: 34 }}>
            <input type="file" accept="image/*" ref={fileRef} onChange={vm.onAvatarFile} style={{ display: 'none' }} />
            <Button variant="secondary" onClick={vm.pickAvatarFile}>{vm.uploadLabel}</Button>
            {vm.avatarPhoto && <LinkButton tone="muted" onClick={vm.removePhoto}>Remove photo</LinkButton>}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12 }}>
        {vm.tests.map((ts) => (
          <div key={ts.id} style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ padding: '14px 18px 10px' }}>
              <Eyebrow tone="muted" size={11}>{ts.provider} · {ts.date}</Eyebrow>
              <div style={{ fontWeight: 600, fontSize: 15, marginTop: 2 }}>{ts.name}</div>
              <div style={{ fontSize: 12.5, color: '#5a6058' }}>{ts.headline}</div>
            </div>
            <div style={{ padding: '0 18px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ts.bars.map((br) => (
                <div key={br.label} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr) 38px', gap: 8, alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: '#3d423b' }}>{br.label}</span>
                  <div style={{ height: 6, borderRadius: 999, background: '#eef0ec', overflow: 'hidden' }}><div style={{ height: '100%', width: br.w, background: br.color }} /></div>
                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#5a6058' }}>{br.val}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: '10px 18px', borderTop: '1px solid #eef0ea', fontSize: 12.5, color: '#3d423b', textWrap: 'pretty' }}>{ts.reading}</div>
            <div style={{ padding: '10px 18px', borderTop: '1px solid #eef0ea', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em' }}>Suggests</div>
              {ts.sugg.map((sg) => (
                <div key={sg.id} onClick={sg.open} style={{ cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#8a5a8c', flex: 'none', marginTop: 6 }} />
                  <div style={{ minWidth: 0 }}><div style={{ fontWeight: 500, fontSize: 12.5 }}>{sg.title}</div><div style={{ fontSize: 12, color: '#8b918a', textWrap: 'pretty' }}>{sg.text}</div></div>
                </div>
              ))}
            </div>
            <div style={{ padding: '10px 18px', borderTop: '1px solid #eef0ea', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#5a6058' }}>Visible to</span>
              <PillToggle options={vm.shareOptions} value={ts.share} onChange={ts.setShare} size="xs" />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 440px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, overflow: 'hidden' }}>
            <div style={panelHead}><div style={{ fontWeight: 600 }}>Ambitions</div><div style={{ fontSize: 12, color: '#5a6058' }}>In your words. Each one widens your ambitions cloud and adds learnings to the ambition path.</div></div>
            {vm.ambitions.map((am) => (
              <div key={am.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'start', padding: '12px 18px', borderTop: '1px solid #eef0ea' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, textWrap: 'pretty' }}>{am.text}</div>
                  <div style={{ fontSize: 12, color: '#8b918a' }}>{am.meta}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{am.doms.map((ad) => <Tag key={ad.key} tone="muted">{ad.label}</Tag>)}</div>
                </div>
                <LinkButton tone="muted" onClick={am.remove}>Remove</LinkButton>
              </div>
            ))}
          </div>
          <div style={{ background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ ...panelHead, borderBottom: '1px solid #eef0ea' }}><div style={{ fontWeight: 600 }}>Interests</div><div style={{ fontSize: 12, color: '#5a6058' }}>Topics you want more of. Each maps to a domain on your map.</div></div>
            <div style={{ padding: '14px 18px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {vm.interests.map((tg) => (
                <span key={tg.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 30, padding: '0 6px 0 12px', border: '1px solid #d5dacf', borderRadius: 999, background: '#fff', fontSize: 12.5, fontWeight: 600 }}>
                  {tg.label}<span style={{ fontWeight: 400, color: '#8b918a' }}>{tg.dom}</span>
                  <Hover as="button" type="button" onClick={tg.remove} title="Remove" aria-label={'Remove ' + tg.label} hoverStyle={{ background: '#f3f5f0', color: '#1a1d18' }}
                    style={{ width: 20, height: 20, border: 0, borderRadius: '50%', background: 'transparent', color: '#8b918a', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, lineHeight: 1, padding: 0 }}>×</Hover>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ flex: '1 1 380px', minWidth: 300, maxWidth: 540, background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ ...panelHead, borderBottom: '1px solid #eef0ea' }}><div style={{ fontWeight: 600 }}>Talk it through</div><div style={{ fontSize: 12, color: '#5a6058' }}>{vm.chatSub}</div></div>
          <div ref={chatRef} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 18px', height: 380, overflow: 'auto' }}>
            {vm.chat.map((m, i) => <ChatBubble key={i} role={m.role}>{m.text}</ChatBubble>)}
            {vm.chatBusy && <ChatBubble role="assistant"><span style={{ color: '#8b918a' }}>Writing a reply</span></ChatBubble>}
            {vm.hasProposal && (
              <div style={{ border: '1px dashed #86BC25', borderRadius: 6, background: '#fbfdf6', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>Save to your profile?</div>
                {vm.proposalItems.map((pi) => (
                  <div key={pi.kind + pi.text} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12.5 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#5a6058', textTransform: 'uppercase', letterSpacing: '.04em', flex: 'none', width: 70 }}>{pi.kind}</span>
                    <span style={{ textWrap: 'pretty' }}>{pi.text}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="sm" onClick={vm.saveProposal}>Save</Button>
                  <Button variant="secondary" size="sm" onClick={vm.dropProposal}>Not now</Button>
                </div>
              </div>
            )}
          </div>
          <div style={{ padding: '10px 18px 0', display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid #eef0ea' }}>
            {vm.chatPrompts.map((cp) => <FilterChip key={cp.label} onClick={cp.send}>{cp.label}</FilterChip>)}
          </div>
          <div style={{ padding: '10px 18px 14px', display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}><Input placeholder="What would you like more of in your work?" value={vm.chatInput} onChange={vm.setChatInput} onKeyDown={vm.chatKey} /></div>
            <Button size="lg" onClick={vm.sendChat} disabled={vm.chatBusy}>Send</Button>
          </div>
        </div>
      </div>
    </>
  );
}
