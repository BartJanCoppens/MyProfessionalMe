import { useEffect, useMemo, useRef, useState } from 'react';
import { BrandMark, Button, NavGroupHeader, NavItem, StatusChip, Toast } from './ds';
import { readConfig } from './config';
import { initState, Logic } from './model';
import type { AppState } from './types';
import type { VM } from './model';
import { AvatarFace } from './screens/AvatarFace';
import MapScreen from './screens/Map';
import { LibraryScreen, DetailScreen } from './screens/Library';
import ProjectsScreen from './screens/Projects';
import ProfileScreen from './screens/Profile';
import TeamScreen from './screens/Team';
import { AdminLibraryScreen, AdminMappingScreen, AddLearningDrawer } from './screens/Admin';

export default function App() {
  const cfg = useMemo(() => readConfig(), []);
  const [state, setRaw] = useState<AppState>(() => initState(cfg));
  const toastTimer = useRef<number | undefined>(undefined);
  const drag = useRef<string | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  const chat = useRef<HTMLDivElement | null>(null);

  const logic = new Logic(state, (p) => setRaw((s) => ({ ...s, ...(typeof p === 'function' ? p(s) : p) })), cfg, { toastTimer, drag, file, chat });
  const vm = logic.renderVals();

  useEffect(() => { if (chat.current) chat.current.scrollTop = 1e6; }, [state.chat, state.chatBusy, state.proposal]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  return (
    <div data-pm-motion={vm.motionAttr} style={{ display: 'flex', minHeight: '100vh', background: '#f3f5f0', color: '#1a1d18', fontFamily: "'IBM Plex Sans',system-ui,sans-serif", fontSize: 13, lineHeight: 1.45 }}>
      <Sidebar vm={vm} />
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{ height: 60, background: '#fff', borderBottom: '1px solid #e1e5dc', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '0 32px', position: 'sticky', top: 0, zIndex: 5 }}>
          <div style={{ minWidth: 0, flex: '1 1 200px' }}>
            <div style={{ fontSize: 11.5, color: '#8b918a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.crumb}</div>
            <div style={{ fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{vm.headerTitle}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
            <StatusChip status="in-progress" size="md" label={vm.hoursChip} />
            <Button variant="secondary" onClick={vm.toastHelp}>Ask Thomas</Button>
          </div>
        </header>
        <div style={{ padding: '26px 32px 140px', maxWidth: 1260, width: '100%', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {vm.screen === 'map' && <MapScreen vm={vm} />}
          {vm.screen === 'library' && <LibraryScreen vm={vm} />}
          {vm.screen === 'detail' && <DetailScreen vm={vm} />}
          {vm.screen === 'projects' && <ProjectsScreen vm={vm} />}
          {vm.screen === 'profile' && <ProfileScreen vm={vm} fileRef={file} chatRef={chat} />}
          {vm.screen === 'team' && <TeamScreen vm={vm} />}
          {vm.screen === 'adminLib' && <AdminLibraryScreen vm={vm} />}
          {vm.screen === 'adminMap' && <AdminMappingScreen vm={vm} />}
        </div>
      </main>
      {vm.drawerOpen && <AddLearningDrawer vm={vm} />}
      {vm.toast && <Toast>{vm.toast}</Toast>}
    </div>
  );
}

function Sidebar({ vm }: { vm: VM }) {
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
        <div style={{ fontWeight: 600, color: '#fff', fontSize: 13 }}>Lena Mertens</div>
        <div style={{ fontSize: 12, color: '#858c82', marginTop: 2 }}>Senior consultant · {vm.bl} · Brussels</div>
        <div style={{ marginTop: 10, height: 4, borderRadius: 999, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}><div style={{ height: '100%', background: '#86BC25', width: vm.readinessW }} /></div>
        <div style={{ fontSize: 11.5, color: '#a9afa5', marginTop: 6 }}>{vm.readiness}% ready for Manager · review Sep 2027</div>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px' }}>
        <NavGroupHeader>Me</NavGroupHeader>
        <NavItem label="My growth map" active={vm.navMap} onClick={vm.goMap} />
        <NavItem label="Library" count={vm.libCount} active={vm.navLib} onClick={vm.goLibrary} />
        <NavItem label="Projects & evaluations" count={vm.projCount} active={vm.navProj} onClick={vm.goProj} />
        <NavItem label="My profile" active={vm.navProfile} onClick={vm.goProfile} />
        <NavGroupHeader>Counsellor</NavGroupHeader>
        <NavItem label="My team" badge={vm.teamOverdue} active={vm.navTeam} onClick={vm.goTeam} />
        <NavGroupHeader>Administration</NavGroupHeader>
        <NavItem label="Learning library" active={vm.navAdminLib} onClick={vm.goAdminLib} />
        <NavItem label="Curriculum mapping" count={vm.pendingLabel} active={vm.navAdminMap} onClick={vm.goAdminMap} />
      </nav>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px 18px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <span onClick={vm.goProfile} title="Change your avatar in My profile" style={{ width: 32, height: 32, borderRadius: '50%', flex: 'none', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: vm.avatarBg, color: vm.avatarFg, fontSize: 12, fontWeight: 600, cursor: 'pointer', boxShadow: '0 0 0 1px rgba(255,255,255,.16)' }}>
          <AvatarFace vm={vm} fontSize={12} />
        </span>
        <div style={{ minWidth: 0 }}><div style={{ color: '#fff', fontWeight: 500, fontSize: 13 }}>Lena Mertens</div><div style={{ fontSize: 11.5, color: '#858c82' }}>Counsellor: Thomas De Smet</div></div>
      </div>
    </aside>
  );
}
