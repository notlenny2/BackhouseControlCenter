import React, { useState, useEffect } from 'react';

export default function UserManager({ emit, on }) {
  const [users, setUsers] = useState([]);
  const [feedback, setFeedback] = useState({}); // name → message

  useEffect(() => {
    emit('admin:listUsers');

    const offs = [
      on('admin:userList', setUsers),
      on('admin:pinReset', ({ name }) => {
        showFeedback(name, 'PIN cleared');
        emit('admin:listUsers');
      }),
      on('admin:userDeleted', ({ name }) => {
        showFeedback(name, 'Deleted');
        emit('admin:listUsers');
      }),
    ];
    return () => offs.forEach(off => off());
  }, [emit, on]);

  const showFeedback = (name, msg) => {
    setFeedback(prev => ({ ...prev, [name]: msg }));
    setTimeout(() => setFeedback(prev => { const n = { ...prev }; delete n[name]; return n; }), 2500);
  };

  const resetPin = (name) => {
    if (!window.confirm(`Reset PIN for ${name}? They'll be asked to set a new one on next login.`)) return;
    emit('admin:resetPin', { name });
  };

  const deleteUser = (name) => {
    if (!window.confirm(`Delete ${name}? This removes their config and PIN permanently.`)) return;
    emit('admin:deleteUser', { name });
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>Members</div>
        <button onClick={() => emit('admin:listUsers')} style={styles.refreshBtn}>↻ Refresh</button>
      </div>

      {users.length === 0 ? (
        <div style={styles.empty}>No users yet. Band members appear here after their first login.</div>
      ) : (
        <div style={styles.list}>
          {users.map(user => (
            <div key={user.name} style={styles.row}>
              <div style={styles.userInfo}>
                <div style={styles.userName}>{user.name}</div>
                <div style={styles.userMeta}>
                  Bus {user.bus} · {user.faderCount} fader{user.faderCount !== 1 ? 's' : ''}
                  {' · '}
                  {user.hasPin
                    ? <span style={styles.pinSet}>PIN set</span>
                    : <span style={styles.pinUnset}>No PIN</span>
                  }
                </div>
              </div>

              <div style={styles.actions}>
                {feedback[user.name] ? (
                  <span style={styles.feedbackText}>{feedback[user.name]}</span>
                ) : (
                  <>
                    <button
                      onClick={() => resetPin(user.name)}
                      style={styles.resetBtn}
                      title="Clear their PIN so they can set a new one"
                    >
                      Reset PIN
                    </button>
                    <button
                      onClick={() => deleteUser(user.name)}
                      style={styles.deleteBtn}
                      title="Delete this user entirely"
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={styles.note}>
        Reset PIN clears a user's PIN so they can set a new one on their next login. Their fader config is kept.
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: '1px solid #1a1a1a',
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: '#fff',
  },
  refreshBtn: {
    background: '#1a1a1a',
    color: '#888',
    fontSize: 13,
    padding: '6px 12px',
    borderRadius: 8,
    minHeight: 34,
    border: '1px solid #2a2a2a',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 16px',
    borderBottom: '1px solid #151515',
    gap: 12,
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: 16,
    fontWeight: 600,
    color: '#eee',
  },
  userMeta: {
    fontSize: 12,
    color: '#555',
    marginTop: 3,
  },
  pinSet: {
    color: '#4caf50',
  },
  pinUnset: {
    color: '#f44336',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  resetBtn: {
    background: '#1a1a1a',
    color: '#f0a500',
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 14px',
    borderRadius: 8,
    minHeight: 38,
    border: '1px solid #333',
  },
  deleteBtn: {
    background: '#1a1a1a',
    color: '#f44336',
    fontSize: 16,
    padding: '6px 10px',
    borderRadius: 8,
    minHeight: 38,
    minWidth: 38,
    border: '1px solid #2a2a2a',
  },
  feedbackText: {
    fontSize: 13,
    color: '#4caf50',
    fontWeight: 600,
  },
  empty: {
    color: '#444',
    textAlign: 'center',
    padding: '40px 20px',
    fontSize: 14,
    lineHeight: 1.7,
  },
  note: {
    fontSize: 12,
    color: '#444',
    padding: '12px 16px',
    borderTop: '1px solid #151515',
    lineHeight: 1.6,
  },
};
