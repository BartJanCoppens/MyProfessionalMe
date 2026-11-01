import { useEffect, useMemo, useRef, useState } from 'react';
import { BrandMark, Button, LinkButton, NavGroupHeader, NavItem, StatusChip, Tag, Toast } from './ds';
import { readConfig } from './config';
import { ADMIN_SCREENS, initState, Logic } from './model';
import type { AppState } from './types';
import type { VM } from './model';
import { AvatarFace } from './screens/AvatarFace';
import MapScreen from './screens/Map';
import { LibraryScreen, DetailScreen } from './screens/Library';
import ProjectsScreen from './screens/Projects';
import ProfileScreen from './screens/Profile';
import TeamScreen from './screens/Team';
import { AdminLibraryScreen, AddLearningDrawer } from './screens/Admin';
import AdminMappingScreen from './screens/Mapping';
import UsersScreen from './screens/Users';
import SubjectPicker from './screens/SubjectPicker';
import { ChangePasswordScreen, SignInScreen } from './screens/SignIn';
import { useAuth } from './lib/useAuth';
import { useSubject } from './lib/useSubject';
import { useTeam } from './lib/useTeam';
import { memberSummary } from './logic/team';
import type { Subject } from './lib/useSubject';
import type { Auth } from './lib/useAuth';

export default function App() {
  const auth = useAuth();
  if (auth.status === 'loading') return <div style={{ minHeight: '100vh', background: '#f3f5f0' }} />;
  if (auth.status === 'signed-out' || !auth.profile) return <SignInScreen />;
  if (auth.profile.must_change_password) return <ChangePasswordScreen email={auth.profile.email} onDone={auth.reload} onSignOut={auth.signOut} />;
  return <Workspace auth={auth} />;
}

function Workspace({ auth }: { auth: Auth }) {
  const { subject, options, select, reload, retry, error } = useSubject(auth);
  if (error) return <LoadError message={error} onRetry={retry} onSignOut={auth.signOut} />;
  if (!subject) return <div style={{ minHeight: '100vh', background: '#f3f5f0' }} />;
  return <Shell auth={auth} subject={subject} options={options} select={select} reload={reload} />;
}

function LoadError({ message, onRetry, onSignOut }: { message: string; onRetry: () => void; onSignOut: () => void }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#f3f5f0', fontFamily: "'IBM Plex Sans',system-ui,sans-serif", fontSize: 13, color: '#1a1d18' }}>
      <div style={{ maxWidth: 420, background: '#fff', border: '1px solid #e1e5dc', borderRadius: 6, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 18 }}>Your learning data did not load</div>
        <div style={{ color: '#5a6058', textWrap: 'pretty' }}>{message}</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button onClick={onRetry}>Try again</Button>
          <LinkButton tone="muted" onClick={onSignOut}>Sign out</LinkButton>
        </div>
      </div>
    </div>
  );
}

type ShellProps = { auth: Auth; subject: Subject; options: { id: string; label: string }[]; select: (id: string) => void; reload: () => Promise<void> };

function Shell({ auth, subject, options, select, reload }: ShellProps) {
  const [picking, setPicking] = useState(false);
  const team = useTeam(subject.id);
  const [today] = useState(() => new Date());
  const cfg = useMemo(() => readConfig(), []);
  const [state, setRaw] = useState<AppState>(() => {
    const st = initState(cfg);
    // Administration screens need a System or Domain Admin role, also when opened through ?screen=.
    const admin = auth.access.isSystem || auth.access.domains.length > 0;
    return ADMIN_SCREENS.includes(st.screen) && !admin ? { ...st, screen: 'map' } : st;
  });
  const toastTimer = useRef<number | undefined>(undefined);
  const drag = useRef<string | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  const chat = useRef<HTMLDivElement | null>(null);

  const logic = new Logic(state, (p) => setRaw((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg, { toastTimer, drag, file, chat }, auth.access, subject, reload);
  const vm = logic.renderVals();

  useEffect(() => { if (chat.current) chat.current.scrollTop = 1e6; }, [state.chat, state.chatBusy, state.proposal]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  return (
    <div data-pm-motion={vm.motionAttr} style={{ display: 'flex', minHeight: '100vh', background: '#f3f5f0', color: '#1a1d18', fontFamily: "'IBM Plex Sans',system-ui,sans-serif", fontSize: 13, lineHeight: 1.45 }}>
      <Sidebar vm={vm} auth={auth} teamOverdue={(team || []).filter((m) => memberSummary(m, state.maps, today).overdue > 0).length} canPick={options.length > 1} onPick={() => setPicking(true)} onBackToMe={() => select(auth.profile!.id)} />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ height: 60, background: '#fff', borderBottom: '1px solid #e1e5dc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '0 32px', position: 'sticky', top: 0, zIndex: 5 }}>
          <div style={{ minWidth: 0, flex: '1 1 200px' }}>
            <div style={{ fontSize: 11.5, color: '#8b918a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.crumb}</div>
            <div style={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.headerTitle}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
            <StatusChip status="in-progress" size="md" label={vm.hoursChip} />
            <Button variant="secondary" onClick={vm.toastHelp}>{vm.askLabel}</Button>
          </div>
        </header>
        <div style={{ padding: '26px 32px 140px', maxWidth: 1260, width: '100%', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {vm.screen === 'map' && <MapScreen vm={vm} />}
          {vm.screen === 'library' && <LibraryScreen vm={vm} />}
          {vm.screen === 'detail' && <DetailScreen vm={vm} />}
          {vm.screen === 'projects' && <ProjectsScreen vm={vm} />}
          {vm.screen === 'profile' && <ProfileScreen vm={vm} fileRef={file} chatRef={chat} />}
          {vm.screen === 'team' && <TeamScreen vm={vm} members={team} onOpen={(id) => { select(id); logic.go('map'); }} />}
          {vm.screen === 'adminLib' && <AdminLibraryScreen vm={vm} />}
          {vm.screen === 'adminMap' && <AdminMappingScreen vm={vm} />}
          {vm.screen === 'users' && <UsersScreen access={auth.access} meId={auth.profile!.id} say={(m) => logic.say(m)} />}
        </div>
      </main>
      {vm.drawerOpen && <AddLearningDrawer vm={vm} />}
      {picking && <SubjectPicker options={options} current={subject.id} onSelect={select} onClose={() => setPicking(false)} />}
      {vm.toast && <Toast>{vm.toast}</Toast>}
    </div>
  );
}

const roleLabel = ({ access }: Auth) =>
  access.isSystem ? 'System Admin' : access.domains.length ? 'Domain Admin · ' + access.domains.join(', ') : 'Member';

function Sidebar({ vm, auth, teamOverdue, canPick, onPick, onBackToMe }: { vm: VM; auth: Auth; teamOverdue: number; canPick: boolean; onPick: () => void; onBackToMe: () => void }) {
  return (
    <aside style={{ width: 248, flex: 'none', background: '#171a16', color: '#c9cec5', display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh', overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 20px 14px' }}>
        <BrandMark />
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.1, color: '#fff' }}>MyProfessionalMe</div>
          <div style={{ fontSize: 11, color: '#858c82', letterSpacing: '.04em', textTransform: 'uppercase' }}>Learning &amp; growth</div>
        </div>
      </div>
      <div style={{ margin: '4px 12px 14px', padding: 12, borderRadius: 6, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.06)' }}>
        <div style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>{vm.who.name}</div>
        <div style={{ fontSize: 12, color: '#858c82', marginTop: 2 }}>{vm.who.roleLine}</div>
        <div style={{ marginTop: 10, height: 4, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}><div style={{ height: '100%', background: '#86BC25', width: vm.readinessW }} /></div>
        <div style={{ fontSize: 11.5, color: '#a9afa5', marginTop: 6 }}>{vm.who.readinessLine}</div>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px' }}>
        <NavGroupHeader>Me</NavGroupHeader>
        <NavItem label="My growth map" active={vm.navMap} onClick={vm.goMap} />
        <NavItem label="Library" count={vm.libCount} active={vm.navLib} onClick={vm.goLibrary} />
        <NavItem label="Projects & evaluations" count={vm.projCount} active={vm.navProj} onClick={vm.goProj} />
        <NavItem label="My profile" active={vm.navProfile} onClick={vm.goProfile} />
        <NavGroupHeader>Counsellor</NavGroupHeader>
        <NavItem label="My team" badge={teamOverdue} active={vm.navTeam} onClick={vm.goTeam} />
        {vm.showAdmin && (
          <>
            <NavGroupHeader>Administration</NavGroupHeader>
            <NavItem label="Learning library" active={vm.navAdminLib} onClick={vm.goAdminLib} />
            <NavItem label="Curriculum mapping" count={vm.pendingLabel} active={vm.navAdminMap} onClick={vm.goAdminMap} />
            <NavItem label="User management" active={vm.navUsers} onClick={vm.goUsers} />
          </>
        )}
      </nav>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px 18px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <span onClick={vm.goProfile} title="Change your avatar in My profile" style={{ width: 32, height: 32, borderRadius: '50%', flex: 'none', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: vm.avatarBg, color: vm.avatarFg, fontSize: 12, fontWeight: 600, cursor: 'pointer', boxShadow: '0 0 0 1px rgba(255,255,255,.16)' }}>
          <AvatarFace vm={vm} fontSize={12} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: '#fff', fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.who.name}</div>
          <div style={{ fontSize: 11.5, color: '#858c82' }}>{vm.who.counsellorLine}</div>
          {vm.who.readOnly && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <Tag tone="amber">Viewing · read-only</Tag>
              <LinkButton tone="onDark" size={12} onClick={onBackToMe}>Back to me</LinkButton>
            </div>
          )}
        </div>
        {canPick && <LinkButton tone="onDark" size={12} onClick={onPick} title="View the app as another user">Change</LinkButton>}
      </div>
      <div style={{ padding: '10px 20px 14px', borderTop: '1px solid rgba(255,255,255,.08)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: '#858c82', textTransform: 'uppercase', letterSpacing: '.06em' }}>Signed in</div>
          <div style={{ color: '#c9cec5', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={auth.profile!.email}>{auth.profile!.full_name || auth.profile!.email}</div>
          <div style={{ fontSize: 11.5, color: '#858c82' }}>{roleLabel(auth)}</div>
        </div>
        <LinkButton tone="onDark" size={12} onClick={auth.signOut}>Sign out</LinkButton>
      </div>
    </aside>
  );
}
