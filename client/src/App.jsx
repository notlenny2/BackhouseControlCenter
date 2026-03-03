import React, { useState, useEffect, useCallback } from 'react';
import MonitorMix from './views/MonitorMix';
import Setlist from './views/Setlist';
import ShowControl from './views/ShowControl';
import StreamControl from './views/StreamControl';
import UserManager from './views/UserManager';
import Settings from './views/Settings';
import { useSocket } from './hooks/useSocket';

const MEMBER_TABS = [
  { id: 'mix', label: 'Mix', icon: '🎚' },
  { id: 'setlist', label: 'Setlist', icon: '📋' },
  { id: 'stream', label: 'Cameras', icon: '📡' },
];
const ADMIN_TABS = [
  { id: 'mix', label: 'Mix', icon: '🎚' },
  { id: 'setlist', label: 'Setlist', icon: '📋' },
  { id: 'show', label: 'Show', icon: '⏱' },
  { id: 'stream', label: 'Stream', icon: '📡' },
  { id: 'users',    label: 'Users',    icon: '👥' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export default function App() {
  const [screen, setScreen] = useState('login');
  const [userName, setUserName] = useState('');
  const [activeTab, setActiveTab] = useState('mix');
  const [showProfile, setShowProfile] = useState(false);
  const { emit, on, connected } = useSocket();

  // Restore session on mount / reconnect
  useEffect(() => {
    emit('status:request'); // get current server state now that we're listening
    const token = localStorage.getItem('bhp_token');
    if (!token) return;
    emit('user:validateSession', { token });

    const offValid = on('user:sessionValid', ({ name, role }) => {
      setUserName(name);
      setScreen(role);
    });
    const offInvalid = on('user:sessionInvalid', () => {
      localStorage.removeItem('bhp_token');
      localStorage.removeItem('bhp_user');
      localStorage.removeItem('bhp_role');
    });
    return () => { offValid(); offInvalid(); };
  }, [emit, on]);

  const handleAuthSuccess = useCallback(({ name, role, token }) => {
    localStorage.setItem('bhp_token', token);
    localStorage.setItem('bhp_user', name);
    localStorage.setItem('bhp_role', role);
    setUserName(name);
    setScreen(role);
    setActiveTab('mix');

  }, []);

  const switchUser = () => {
    // Clear session but go back to login (keeps names list for quick re-select)
    localStorage.removeItem('bhp_token');
    localStorage.removeItem('bhp_user');
    localStorage.removeItem('bhp_role');
    setScreen('login');
    setUserName('');
    setShowProfile(false);
  };

  const isAdmin = screen === 'admin';
  const tabs = isAdmin ? ADMIN_TABS : MEMBER_TABS;

  if (screen === 'login') {
    return <LoginScreen connected={connected} emit={emit} on={on} onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div style={app.container}>
      {/* Header */}
      <div style={app.header}>
        <div style={app.headerLeft}>
          <div style={{ ...app.connDot, background: connected ? '#00e676' : '#f44336' }} />
        </div>
        <div style={app.headerRight}>
          <span style={app.appName}>BHP Command Center</span>
          {/* Tappable username → profile sheet */}
          <button onClick={() => setShowProfile(true)} style={app.userBtn}>
            {isAdmin ? `Band Leader: ${userName}` : userName} ▾
          </button>
        </div>
      </div>

      {/* Profile sheet */}
      {showProfile && (
        <ProfileSheet
          userName={userName}
          isAdmin={isAdmin}
          emit={emit}
          on={on}
          onSwitchUser={switchUser}
          onClose={() => setShowProfile(false)}
        />
      )}

      {/* Tab content */}
      <div style={app.content}>
        {activeTab === 'mix' && <MonitorMix userName={userName} />}
        {activeTab === 'setlist' && <Setlist isAdmin={isAdmin} userName={userName} />}
        {activeTab === 'show' && isAdmin && <ShowControl />}
        {activeTab === 'stream' && <StreamControl isAdmin={isAdmin} onOpenSettings={isAdmin ? () => setActiveTab('settings') : undefined} />}
        {activeTab === 'users'    && isAdmin && <UserManager emit={emit} on={on} />}
        {activeTab === 'settings' && isAdmin && <Settings />}
      </div>

      {/* Tab bar */}
      <div style={app.tabBar}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{ ...app.tabBtn, ...(activeTab === tab.id ? app.tabActive : {}) }}
          >
            <span style={app.tabIcon}>{tab.icon}</span>
            <span style={app.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Profile sheet (slide up from header) ────────────────────────────────────

function ProfileSheet({ userName, isAdmin, emit, on, onSwitchUser, onClose }) {
  const [view, setView] = useState('main'); // main | changePin
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const off = on('user:changePinResult', ({ success: ok, error: err }) => {
      setLoading(false);
      if (ok) {
        setSuccess('PIN updated successfully');
        setCurrentPin(''); setNewPin(''); setConfirmPin('');
        setTimeout(() => { setSuccess(''); setView('main'); }, 1800);
      } else {
        setError(err || 'Failed to update PIN');
      }
    });
    return off;
  }, [on]);

  const submitChangePin = () => {
    if (!currentPin) { setError('Enter your current PIN'); return; }
    if (newPin.length < 4) { setError('New PIN must be at least 4 digits'); return; }
    if (newPin !== confirmPin) { setError('New PINs do not match'); return; }
    setError('');
    setLoading(true);
    emit('user:changePin', { name: userName, currentPin, newPin });
  };

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={ps.backdrop} />

      <div style={ps.sheet}>
        {view === 'main' && (
          <>
            <div style={ps.handle} />
            <div style={ps.userName}>{userName}</div>
            {isAdmin && <div style={ps.roleBadge}>Band Leader</div>}

            <div style={ps.menu}>
              {!isAdmin && (
                <button onClick={() => { setView('changePin'); setError(''); }} style={ps.menuItem}>
                  <span style={ps.menuIcon}>🔑</span>
                  <span style={ps.menuLabel}>Change PIN</span>
                  <span style={ps.menuArrow}>›</span>
                </button>
              )}
              <button onClick={onSwitchUser} style={ps.menuItem}>
                <span style={ps.menuIcon}>👤</span>
                <span style={ps.menuLabel}>Switch User</span>
                <span style={ps.menuArrow}>›</span>
              </button>
              <button onClick={onClose} style={{ ...ps.menuItem, ...ps.cancelItem }}>
                Cancel
              </button>
            </div>
          </>
        )}

        {view === 'changePin' && (
          <>
            <div style={ps.handle} />
            <div style={ps.sheetTitle}>Change PIN</div>

            <div style={ps.pinFields}>
              <div style={ps.pinField}>
                <label style={ps.pinLabel}>Current PIN</label>
                <PinInput value={currentPin} onChange={setCurrentPin} onEnter={() => {}} />
              </div>
              <div style={ps.pinField}>
                <label style={ps.pinLabel}>New PIN</label>
                <PinInput value={newPin} onChange={setNewPin} onEnter={() => {}} />
              </div>
              <div style={ps.pinField}>
                <label style={ps.pinLabel}>Confirm New PIN</label>
                <PinInput value={confirmPin} onChange={setConfirmPin} onEnter={submitChangePin} />
              </div>
            </div>

            {error && <div style={ps.error}>{error}</div>}
            {success && <div style={ps.successMsg}>{success}</div>}

            <div style={ps.sheetButtons}>
              <button onClick={() => { setView('main'); setError(''); setCurrentPin(''); setNewPin(''); setConfirmPin(''); }} style={ps.cancelBtn}>
                Cancel
              </button>
              <button
                onClick={submitChangePin}
                disabled={loading || !currentPin || newPin.length < 4 || !confirmPin}
                style={{ ...ps.saveBtn, opacity: !loading && currentPin && newPin.length >= 4 && confirmPin ? 1 : 0.4 }}
              >
                {loading ? 'Saving...' : 'Update PIN'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen({ connected, emit, on, onAuthSuccess }) {
  const [step, setStep] = useState('name');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [existingUsers, setExistingUsers] = useState([]);

  // Fetch existing user names for the quick-picker
  useEffect(() => {
    if (connected) emit('user:listNames');
  }, [connected, emit]);

  useEffect(() => {
    const offs = [
      on('user:nameList', setExistingUsers),
      on('user:nameStatus', ({ exists }) => {
        setStep(exists ? 'pin' : 'newpin');
        setError('');
      }),
      on('user:authResult', ({ success, error: err, name: n, role, token }) => {
        setLoading(false);
        if (success) {
          onAuthSuccess({ name: n, role, token });
        } else {
          setError(err || 'Authentication failed');
          setPin(''); setPinConfirm('');
        }
      }),
    ];
    return () => offs.forEach(o => o());
  }, [on, onAuthSuccess, connected]);

  const checkName = () => {
    const t = name.trim();
    if (!t) return;
    setError('');
    emit('user:checkName', { name: t });
  };

  const selectExistingUser = (n) => {
    setName(n);
    setStep('pin');
    setPin('');
    setError('');
  };

  const submitPin = () => {
    if (pin.length < 4) { setError('PIN must be at least 4 digits'); return; }
    setError(''); setLoading(true);
    emit('user:auth', { name: name.trim(), pin });
  };

  const submitNewPin = () => {
    if (pin.length < 4) { setError('PIN must be at least 4 digits'); return; }
    if (pin !== pinConfirm) { setError('PINs do not match'); return; }
    setError(''); setLoading(true);
    emit('user:auth', { name: name.trim(), pin });
  };

  const submitAdmin = () => {
    if (!adminCode) { setError('Enter admin code'); return; }
    setError(''); setLoading(true);
    emit('user:auth', { name: name.trim() || 'Admin', pin: adminCode, isAdmin: true });
  };

  const back = () => {
    setStep('name'); setPin(''); setPinConfirm('');
    setAdminCode(''); setError('');
    emit('user:listNames'); // refresh list
  };

  return (
    <div style={ls.container}>
      <div style={ls.card}>

        {/* Logo */}
        <div style={ls.logo}>
          <div style={ls.logoIcon}>🎛</div>
          <div style={ls.logoText}>Backhouse Productions</div>
          <div style={ls.logoSub}>Live Show Control</div>
        </div>

        <div style={ls.connRow}>
          <div style={{ ...ls.connDot, background: connected ? '#00e676' : '#f44336' }} />
          <span style={ls.connLabel}>{connected ? 'Connected' : 'Connecting...'}</span>
        </div>

        {/* ── Step: Name + quick-picker ── */}
        {step === 'name' && (
          <>
            {/* Existing user quick-select */}
            {existingUsers.length > 0 && (
              <div style={ls.quickPick}>
                <div style={ls.quickPickLabel}>Quick sign in</div>
                <div style={ls.quickPickGrid}>
                  {existingUsers.map(n => (
                    <button key={n} onClick={() => selectExistingUser(n)} style={ls.userChip}>
                      <span style={ls.chipAvatar}>{n[0].toUpperCase()}</span>
                      <span style={ls.chipName}>{n}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Manual name entry for new users */}
            <div style={ls.divider}>
              <div style={ls.dividerLine} />
              <span style={ls.dividerText}>{existingUsers.length > 0 ? 'or new user' : 'enter your name'}</span>
              <div style={ls.dividerLine} />
            </div>

            <div style={ls.field}>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') checkName(); }}
                placeholder="Type your name..."
                style={ls.input}
                autoCapitalize="words"
                autoComplete="name"
              />
            </div>

            <div style={ls.buttons}>
              <button
                onClick={checkName}
                disabled={!name.trim() || !connected}
                style={{ ...ls.primaryBtn, opacity: name.trim() && connected ? 1 : 0.4 }}
              >
                Continue →
              </button>
              <button onClick={() => { setStep('admincode'); setError(''); }} style={ls.ghostBtn}>
                Band Leader Access
              </button>
            </div>
          </>
        )}

        {/* ── Step: PIN (existing user) ── */}
        {step === 'pin' && (
          <>
            <div style={ls.welcomeBack}>Welcome back, <strong>{name}</strong></div>
            <div style={ls.field}>
              <label style={ls.label}>Enter your PIN</label>
              <PinInput value={pin} onChange={setPin} onEnter={submitPin} />
            </div>
            {error && <div style={ls.error}>{error}</div>}
            <div style={ls.buttons}>
              <button
                onClick={submitPin}
                disabled={pin.length < 4 || loading}
                style={{ ...ls.primaryBtn, opacity: pin.length >= 4 && !loading ? 1 : 0.4 }}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
              <button onClick={back} style={ls.ghostBtn}>← Back</button>
            </div>
          </>
        )}

        {/* ── Step: New PIN ── */}
        {step === 'newpin' && (
          <>
            <div style={ls.newBadge}>New account — <strong>{name}</strong></div>
            <div style={ls.field}>
              <label style={ls.label}>Create a PIN (4+ digits)</label>
              <PinInput value={pin} onChange={setPin} onEnter={() => {}} />
            </div>
            <div style={ls.field}>
              <label style={ls.label}>Confirm PIN</label>
              <PinInput value={pinConfirm} onChange={setPinConfirm} onEnter={submitNewPin} />
            </div>
            {error && <div style={ls.error}>{error}</div>}
            <div style={ls.buttons}>
              <button
                onClick={submitNewPin}
                disabled={pin.length < 4 || !pinConfirm || loading}
                style={{ ...ls.primaryBtn, opacity: pin.length >= 4 && pinConfirm && !loading ? 1 : 0.4 }}
              >
                {loading ? 'Creating...' : 'Create Account'}
              </button>
              <button onClick={back} style={ls.ghostBtn}>← Back</button>
            </div>
          </>
        )}

        {/* ── Step: Band Leader code ── */}
        {step === 'admincode' && (
          <>
            <div style={ls.field}>
              <label style={ls.label}>Your Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                style={ls.input}
                autoCapitalize="words"
              />
            </div>
            <div style={ls.field}>
              <label style={ls.label}>Band Leader Code</label>
              <input
                type="password"
                value={adminCode}
                onChange={e => setAdminCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitAdmin(); }}
                placeholder="Enter code"
                style={ls.input}
                autoFocus
                autoComplete="new-password"
                data-1p-ignore="true"
                data-lpignore="true"
                spellCheck={false}
              />
            </div>
            {error && <div style={ls.error}>{error}</div>}
            <div style={ls.buttons}>
              <button
                onClick={submitAdmin}
                disabled={!adminCode || loading}
                style={{ ...ls.adminBtn, opacity: adminCode && !loading ? 1 : 0.4 }}
              >
                {loading ? 'Entering...' : 'Enter as Band Leader'}
              </button>
              <button onClick={back} style={ls.ghostBtn}>← Back</button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

// ─── Shared PIN input ─────────────────────────────────────────────────────────

function PinInput({ value, onChange, onEnter }) {
  return (
    <input
      type="password"
      inputMode="numeric"
      pattern="[0-9]*"
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 8))}
      onKeyDown={e => { if (e.key === 'Enter') onEnter(); }}
      placeholder="••••"
      style={ls.pinInput}
      autoComplete="new-password"
      data-1p-ignore="true"
      data-lpignore="true"
      spellCheck={false}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const app = {
  container: { display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0d0d0d', overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', height: 44, background: '#111', borderBottom: '1px solid #222', flexShrink: 0, position: 'relative' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 6 },
  connDot: { width: 7, height: 7, borderRadius: '50%' },
  headerRight: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginLeft: 'auto' },
  appName: {
    fontFamily: "'BHP-PunkKid', serif",
    fontSize: 14,
    lineHeight: 0.95,
    color: '#f0a500',
    letterSpacing: 0.8,
    width: 108,
    whiteSpace: 'normal',
    overflowWrap: 'break-word',
    textAlign: 'right',
  },
  userBtn: {
    background: 'transparent',
    color: '#888',
    fontSize: 11,
    padding: '2px 8px',
    minHeight: 28,
    borderRadius: 6,
    border: '1px solid #2a2a2a',
    whiteSpace: 'nowrap',
  },
  content: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  tabBar: { display: 'flex', borderTop: '1px solid #1a1a1a', background: '#0d0d0d', flexShrink: 0, paddingBottom: 'env(safe-area-inset-bottom)' },
  tabBtn: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 4px', background: 'transparent', color: '#555', borderRadius: 0, gap: 3, minHeight: 56 },
  tabActive: { color: '#f0a500' },
  tabIcon: { fontSize: 22, lineHeight: 1 },
  tabLabel: { fontSize: 10, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' },
};

const ps = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100 },
  sheet: { position: 'fixed', bottom: 0, left: 0, right: 0, background: '#181818', borderRadius: '16px 16px 0 0', zIndex: 101, padding: '0 16px 32px', paddingBottom: 'max(32px, env(safe-area-inset-bottom))' },
  handle: { width: 36, height: 4, background: '#333', borderRadius: 2, margin: '10px auto 20px' },
  userName: { fontSize: 22, fontWeight: 700, color: '#fff', textAlign: 'center', marginBottom: 4 },
  roleBadge: { fontSize: 11, color: '#f0a500', textAlign: 'center', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 },
  menu: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 },
  menuItem: { display: 'flex', alignItems: 'center', gap: 12, background: '#222', color: '#eee', fontSize: 16, padding: '14px 16px', borderRadius: 12, minHeight: 52, width: '100%', textAlign: 'left' },
  menuIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  menuLabel: { flex: 1 },
  menuArrow: { fontSize: 20, color: '#555' },
  cancelItem: { background: '#161616', color: '#666', justifyContent: 'center', marginTop: 4 },
  sheetTitle: { fontSize: 18, fontWeight: 700, color: '#fff', textAlign: 'center', marginBottom: 20 },
  pinFields: { display: 'flex', flexDirection: 'column', gap: 14 },
  pinField: { display: 'flex', flexDirection: 'column', gap: 6 },
  pinLabel: { fontSize: 11, fontWeight: 700, color: '#666', letterSpacing: 0.8, textTransform: 'uppercase' },
  error: { fontSize: 13, color: '#f44336', textAlign: 'center', marginTop: 8 },
  successMsg: { fontSize: 13, color: '#4caf50', textAlign: 'center', fontWeight: 600, marginTop: 8 },
  sheetButtons: { display: 'flex', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, background: '#222', color: '#888', fontSize: 15, padding: '13px', borderRadius: 10, minHeight: 48 },
  saveBtn: { flex: 2, background: '#f0a500', color: '#000', fontSize: 15, fontWeight: 700, padding: '13px', borderRadius: 10, minHeight: 48 },
};

const ls = {
  container: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: '#0d0d0d', padding: 20, overflowY: 'auto' },
  card: { width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 18 },
  logo: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, paddingBottom: 4 },
  logoIcon: { fontSize: 46, lineHeight: 1 },
  logoText: { fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: 0.5 },
  logoSub: { fontSize: 11, color: '#555', letterSpacing: 1, textTransform: 'uppercase' },
  connRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  connDot: { width: 7, height: 7, borderRadius: '50%' },
  connLabel: { fontSize: 12, color: '#555' },
  quickPick: { display: 'flex', flexDirection: 'column', gap: 10 },
  quickPickLabel: { fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8, textAlign: 'center' },
  quickPickGrid: { display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  userChip: { display: 'flex', alignItems: 'center', gap: 8, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 24, padding: '8px 14px 8px 8px', minHeight: 44 },
  chipAvatar: { width: 28, height: 28, borderRadius: '50%', background: '#f0a500', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0, lineHeight: '28px', textAlign: 'center' },
  chipName: { fontSize: 14, fontWeight: 600, color: '#eee' },
  divider: { display: 'flex', alignItems: 'center', gap: 10 },
  dividerLine: { flex: 1, height: 1, background: '#222' },
  dividerText: { fontSize: 11, color: '#444', whiteSpace: 'nowrap' },
  field: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 11, fontWeight: 700, color: '#666', letterSpacing: 0.8, textTransform: 'uppercase' },
  input: { width: '100%', fontSize: 18, padding: '14px 16px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, color: '#fff', minHeight: 52 },
  pinInput: { width: '100%', fontSize: 28, padding: '12px 16px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, color: '#fff', minHeight: 58, letterSpacing: 8, textAlign: 'center' },
  welcomeBack: { fontSize: 16, color: '#aaa', textAlign: 'center' },
  newBadge: { fontSize: 14, color: '#888', textAlign: 'center', padding: '8px 12px', background: 'rgba(240,165,0,0.08)', borderRadius: 8, border: '1px solid rgba(240,165,0,0.2)' },
  error: { fontSize: 13, color: '#f44336', textAlign: 'center' },
  buttons: { display: 'flex', flexDirection: 'column', gap: 10 },
  primaryBtn: { background: '#f0a500', color: '#000', fontSize: 17, fontWeight: 700, padding: '16px', borderRadius: 10, minHeight: 56, width: '100%' },
  adminBtn: { background: '#1a1a1a', color: '#f0a500', fontSize: 16, fontWeight: 700, padding: '14px', borderRadius: 10, minHeight: 52, width: '100%', border: '1px solid #f0a500' },
  ghostBtn: { background: 'transparent', color: '#444', fontSize: 14, padding: '10px', borderRadius: 8, minHeight: 44, width: '100%', border: '1px solid #1e1e1e' },
};
