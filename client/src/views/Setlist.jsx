import React, { useState, useEffect } from 'react';
import { useSocket } from '../hooks/useSocket';

export default function Setlist({ isAdmin, userName }) {
  const { emit, on, connected } = useSocket();
  const [songs, setSongs] = useState([]);
  const [expandedSong, setExpandedSong] = useState(null); // full-screen song view
  const [activeTab, setActiveTab] = useState('lyrics');
  const [showModal, setShowModal] = useState(false);
  const [editingSong, setEditingSong] = useState(null);
  const [form, setForm] = useState({ title: '', artist: '', key: '', tempo: '', notes: '', lyrics: '', bassTab: '', guitarTab: '' });
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  useEffect(() => {
    if (connected) emit('setlist:load');
  }, [connected, emit]);

  useEffect(() => {
    const off = on('setlist:data', (data) => {
      const sorted = [...data].sort((a, b) => a.order - b.order);
      setSongs(sorted);
      // Keep expanded song in sync with live data
      if (expandedSong) {
        const updated = sorted.find(s => s.id === expandedSong.id);
        if (updated) setExpandedSong(updated);
      }
    });
    return off;
  }, [on, expandedSong]);

  const openAdd = () => {
    setEditingSong(null);
    setForm({ title: '', artist: '', key: '', tempo: '', notes: '', lyrics: '', bassTab: '', guitarTab: '' });
    setShowModal(true);
  };

  const openEdit = (song, e) => {
    e && e.stopPropagation();
    setEditingSong(song);
    setForm({
      title: song.title,
      artist: song.artist || '',
      key: song.key || '',
      tempo: song.tempo || '',
      notes: song.notes || '',
      lyrics: song.lyrics || '',
      bassTab: song.bassTab || '',
      guitarTab: song.guitarTab || '',
    });
    setShowModal(true);
  };

  const saveForm = () => {
    if (!form.title.trim()) return;
    if (editingSong) {
      emit('setlist:update', { id: editingSong.id, changes: form });
    } else {
      emit('setlist:add', { song: form });
    }
    setShowModal(false);
  };

  const deleteSong = (id) => {
    emit('setlist:delete', { id });
    setDeleteConfirmId(null);
    setExpandedSong(null);
  };

  const moveUp = (index, e) => {
    e && e.stopPropagation();
    if (index === 0) return;
    const reordered = songs.map(s => ({ id: s.id, order: s.order }));
    const tmp = reordered[index].order;
    reordered[index].order = reordered[index - 1].order;
    reordered[index - 1].order = tmp;
    emit('setlist:reorder', { songs: reordered });
  };

  const moveDown = (index, e) => {
    e && e.stopPropagation();
    if (index === songs.length - 1) return;
    const reordered = songs.map(s => ({ id: s.id, order: s.order }));
    const tmp = reordered[index].order;
    reordered[index].order = reordered[index + 1].order;
    reordered[index + 1].order = tmp;
    emit('setlist:reorder', { songs: reordered });
  };

  const toggleVocalClaim = (songId) => {
    const song = songs.find(s => s.id === songId);
    if (!song) return;
    const claimed = !!(song.vocalClaimers && song.vocalClaimers[userName]);
    emit('setlist:claimVocal', { songId, userName, claimed: !claimed });
  };

  const claimersDisplay = (vocalClaimers) => {
    const names = Object.values(vocalClaimers || {});
    if (!names.length) return null;
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
  };

  const openSong = (song) => {
    setExpandedSong(song);
    // Default to first available tab with content
    const first = ['lyrics', 'bassTab', 'guitarTab', 'notes'].find(k => song[k]);
    setActiveTab(first || 'lyrics');
  };

  // ── Full-screen song view ───────────────────────────────────────────────────

  if (expandedSong) {
    const song = expandedSong;
    const songIndex = songs.findIndex(s => s.id === song.id);
    const isClaimed = !!(song.vocalClaimers && song.vocalClaimers[userName]);
    const claimers = claimersDisplay(song.vocalClaimers);

    // Text tabs (lyrics, notes) and link tabs (bass, guitar) are separate
    const textTabs = [
      { key: 'lyrics', label: 'Lyrics', content: song.lyrics },
      { key: 'notes',  label: 'Notes',  content: song.notes },
    ].filter(t => t.content);

    const linkTabs = [
      { key: 'bassTab',   label: 'Bass Tab',    url: song.bassTab },
      { key: 'guitarTab', label: 'Guitar Tab',  url: song.guitarTab },
    ].filter(t => t.url);

    const currentContent = textTabs.find(t => t.key === activeTab)?.content
      || textTabs[0]?.content
      || '';

    return (
      <div style={s.fullScreen}>

        {/* Top bar */}
        <div style={s.fsTopBar}>
          <button onClick={() => setExpandedSong(null)} style={s.backBtn}>← Back</button>
          <div style={s.fsPosNum}>{songIndex + 1}</div>
          <div style={s.fsAdminBtns}>
            <button
              onClick={() => openEdit(song)}
              style={s.fsIconBtn}
            >✎</button>
            <button
              onClick={() => setDeleteConfirmId(song.id)}
              style={{ ...s.fsIconBtn, color: '#c0392b' }}
            >✕</button>
          </div>
        </div>

        {/* Song title + meta */}
        <div style={s.fsTitleBlock}>
          <div style={s.fsSongTitle}>{song.title}</div>
          <div style={s.fsSongMeta}>
            {song.artist && <span style={s.fsArtist}>{song.artist}</span>}
            {song.key    && <span style={s.fsBadge}>{song.key}</span>}
            {song.tempo  && <span style={s.fsBadge}>{song.tempo}</span>}
          </div>
          {claimers && (
            <div style={s.fsClaimers}>🎤 {claimers}</div>
          )}
        </div>

        {/* Tab bar — text tabs only */}
        {textTabs.length > 1 && (
          <div style={s.fsTabBar}>
            {textTabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{ ...s.fsTabBtn, ...(activeTab === t.key ? s.fsTabBtnActive : {}) }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Lyrics / Notes content */}
        <div style={s.fsContent}>
          {currentContent ? (
            <pre style={s.fsContentText}>{currentContent}</pre>
          ) : (
            <div style={s.fsEmpty}>No content</div>
          )}
        </div>

        {/* Bass & Guitar links */}
        {linkTabs.length > 0 && (
          <div style={s.fsLinks}>
            {linkTabs.map(t => (
              <a
                key={t.key}
                href={t.url}
                target="_blank"
                rel="noreferrer"
                style={s.fsLinkBtn}
              >
                <span style={s.fsLinkIcon}>🔗</span>
                <span style={s.fsLinkLabel}>{t.label}</span>
                <span style={s.fsLinkArrow}>↗</span>
              </a>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={s.fsFooter}>
          <button
            onClick={() => toggleVocalClaim(song.id)}
            style={{ ...s.fsClaimBtn, ...(isClaimed ? s.fsClaimBtnActive : {}) }}
          >
            🎤 {isClaimed ? 'Vocals Claimed' : 'Claim Vocals'}
          </button>
          <div style={s.fsNavBtns}>
            <button
              onClick={() => { if (songIndex > 0) openSong(songs[songIndex - 1]); }}
              disabled={songIndex === 0}
              style={{ ...s.fsNavBtn, opacity: songIndex === 0 ? 0.2 : 1 }}
            >◀ Prev</button>
            <button
              onClick={() => { if (songIndex < songs.length - 1) openSong(songs[songIndex + 1]); }}
              disabled={songIndex === songs.length - 1}
              style={{ ...s.fsNavBtn, opacity: songIndex === songs.length - 1 ? 0.2 : 1 }}
            >Next ▶</button>
          </div>
          <div style={s.fsReorderBtns}>
            <button
              onClick={() => moveUp(songIndex)}
              disabled={songIndex === 0}
              style={{ ...s.fsIconBtn, opacity: songIndex === 0 ? 0.2 : 1 }}
            >↑</button>
            <button
              onClick={() => moveDown(songIndex)}
              disabled={songIndex === songs.length - 1}
              style={{ ...s.fsIconBtn, opacity: songIndex === songs.length - 1 ? 0.2 : 1 }}
            >↓</button>
          </div>
        </div>

        {/* Delete confirm */}
        {deleteConfirmId && (
          <>
            <div style={s.backdrop} onClick={() => setDeleteConfirmId(null)} />
            <div style={s.confirmSheet}>
              <div style={s.modalHandle} />
              <div style={s.confirmText}>Remove "{song.title}" from the setlist?</div>
              <div style={s.confirmBtns}>
                <button onClick={() => setDeleteConfirmId(null)} style={s.cancelBtn}>Cancel</button>
                <button onClick={() => deleteSong(deleteConfirmId)} style={s.removeBtnStyle}>Remove</button>
              </div>
            </div>
          </>
        )}

        {/* Edit modal (can open from full-screen) */}
        {showModal && <SongModal editingSong={editingSong} form={form} setForm={setForm} onSave={saveForm} onClose={() => setShowModal(false)} />}
      </div>
    );
  }

  // ── Song list ───────────────────────────────────────────────────────────────

  return (
    <div style={s.container}>

      <div style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.headerTitle}>SETLIST</span>
          <span style={s.headerCount}>{songs.length} song{songs.length !== 1 ? 's' : ''}</span>
        </div>
        <button onClick={openAdd} style={s.addBtn}>+ Add</button>
      </div>

      <div style={s.list}>
        {songs.length === 0 ? (
          <div style={s.empty}>No songs yet — tap + Add to build your setlist.</div>
        ) : (
          songs.map((song, index) => {
            const isClaimed = !!(song.vocalClaimers && song.vocalClaimers[userName]);
            const claimers = claimersDisplay(song.vocalClaimers);
            const hasContent = song.lyrics || song.bassTab || song.guitarTab || song.notes;

            return (
              <div key={song.id} style={s.card} onClick={() => openSong(song)}>
                <div style={s.cardNumCol}>
                  <span style={s.posNum}>{index + 1}</span>
                </div>
                <div style={s.cardBody}>
                  <div style={s.songTitle}>{song.title}</div>
                  <div style={s.songMeta}>
                    {song.artist && <span style={s.artistName}>{song.artist}</span>}
                    {song.key    && <span style={s.badge}>{song.key}</span>}
                    {song.tempo  && <span style={s.badge}>{song.tempo}</span>}
                  </div>
                  {claimers && (
                    <div style={s.claimersRow}>
                      <span style={s.claimersText}>🎤 {claimers}</span>
                    </div>
                  )}
                </div>
                <div style={s.cardRight}>
                  {hasContent && <span style={s.contentDot} />}
                  {isClaimed && <span style={s.claimedDot} />}
                  <span style={s.chevron}>›</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showModal && <SongModal editingSong={editingSong} form={form} setForm={setForm} onSave={saveForm} onClose={() => setShowModal(false)} />}

      {deleteConfirmId && (
        <>
          <div style={s.backdrop} onClick={() => setDeleteConfirmId(null)} />
          <div style={s.confirmSheet}>
            <div style={s.modalHandle} />
            <div style={s.confirmText}>Remove this song from the setlist?</div>
            <div style={s.confirmBtns}>
              <button onClick={() => setDeleteConfirmId(null)} style={s.cancelBtn}>Cancel</button>
              <button onClick={() => deleteSong(deleteConfirmId)} style={s.removeBtnStyle}>Remove</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Song add/edit modal ─────────────────────────────────────────────────────

function SongModal({ editingSong, form, setForm, onSave, onClose }) {
  const f = (key, val) => setForm(prev => ({ ...prev, [key]: val }));
  const valid = form.title.trim().length > 0;

  return (
    <>
      <div style={s.backdrop} onClick={onClose} />
      <div style={s.modal}>
        <div style={s.modalHandle} />
        <div style={s.modalTitle}>{editingSong ? 'Edit Song' : 'Add Song'}</div>

        <div style={s.formFields}>
          <FormField label="TITLE *">
            <input value={form.title} onChange={e => f('title', e.target.value)}
              placeholder="Song title" style={s.input} autoFocus />
          </FormField>

          <FormField label="ARTIST">
            <input value={form.artist} onChange={e => f('artist', e.target.value)}
              placeholder="Artist / Band" style={s.input} />
          </FormField>

          <div style={s.fieldRow}>
            <FormField label="KEY" style={{ flex: 1 }}>
              <input value={form.key} onChange={e => f('key', e.target.value)}
                placeholder="e.g. Am" style={s.input} />
            </FormField>
            <FormField label="TEMPO" style={{ flex: 1 }}>
              <input value={form.tempo} onChange={e => f('tempo', e.target.value)}
                placeholder="e.g. 120 BPM" style={s.input} />
            </FormField>
          </div>

          <FormField label="LYRICS">
            <textarea value={form.lyrics} onChange={e => f('lyrics', e.target.value)}
              placeholder="Lyrics..." style={{ ...s.input, ...s.textarea }} rows={6} />
          </FormField>

          <FormField label="BASS TAB LINK">
            <input type="url" value={form.bassTab} onChange={e => f('bassTab', e.target.value)}
              placeholder="https://tabs.ultimate-guitar.com/..." style={s.input} />
          </FormField>

          <FormField label="GUITAR TAB LINK">
            <input type="url" value={form.guitarTab} onChange={e => f('guitarTab', e.target.value)}
              placeholder="https://tabs.ultimate-guitar.com/..." style={s.input} />
          </FormField>

          <FormField label="NOTES">
            <textarea value={form.notes} onChange={e => f('notes', e.target.value)}
              placeholder="Performance notes..." style={{ ...s.input, ...s.textarea }} rows={3} />
          </FormField>
        </div>

        <div style={s.modalFooter}>
          <button onClick={onClose} style={s.cancelBtn}>Cancel</button>
          <button onClick={onSave} disabled={!valid}
            style={{ ...s.saveBtn, opacity: valid ? 1 : 0.4 }}>
            {editingSong ? 'Save Changes' : 'Add to Setlist'}
          </button>
        </div>
      </div>
    </>
  );
}

function FormField({ label, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      <span style={s.fieldLabel}>{label}</span>
      {children}
    </div>
  );
}

const s = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    overflow: 'hidden',
    background: '#080808',
  },

  // ── Header ──
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    background: 'linear-gradient(90deg, #0d0d0d, #111)',
    borderBottom: '1px solid #1f1f1f',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 13,
    fontWeight: 700,
    color: '#f0a500',
    letterSpacing: 2,
  },
  headerCount: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 11,
    color: '#3a3a3a',
  },
  addBtn: {
    background: 'rgba(240,165,0,0.12)',
    color: '#f0a500',
    fontSize: 14,
    fontWeight: 700,
    padding: '6px 14px',
    borderRadius: 8,
    border: '1px solid rgba(240,165,0,0.25)',
    minHeight: 36,
    letterSpacing: 0.3,
  },

  // ── Song list ──
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 10px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  empty: {
    color: '#2a2a2a',
    textAlign: 'center',
    fontSize: 14,
    padding: '60px 24px',
    fontFamily: "'BHP-Mono', monospace",
    lineHeight: 1.6,
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    background: '#0f0f0f',
    border: '1px solid #1c1c1c',
    borderRadius: 10,
    padding: '10px 12px',
    gap: 10,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none',
    minHeight: 56,
  },
  cardNumCol: {
    width: 30,
    textAlign: 'center',
    flexShrink: 0,
  },
  posNum: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 16,
    fontWeight: 700,
    color: '#f0a500',
    opacity: 0.7,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  songTitle: {
    fontFamily: "'BHP-Label', sans-serif",
    fontSize: 17,
    color: '#ececec',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: 1.2,
  },
  songMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'wrap',
  },
  artistName: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 12,
    color: '#555',
    letterSpacing: 0.2,
  },
  badge: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 11,
    color: '#f0a500',
    background: 'rgba(240,165,0,0.08)',
    border: '1px solid rgba(240,165,0,0.18)',
    borderRadius: 4,
    padding: '1px 6px',
    letterSpacing: 0.3,
  },
  claimersRow: {
    marginTop: 2,
  },
  claimersText: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 11,
    color: '#4fc3f7',
    letterSpacing: 0.2,
  },
  cardRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  contentDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#3a3a3a',
  },
  claimedDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#4fc3f7',
    opacity: 0.7,
  },
  chevron: {
    fontSize: 22,
    color: '#2a2a2a',
    lineHeight: 1,
  },

  // ── Full screen song view ──
  fullScreen: {
    position: 'fixed',
    inset: 0,
    background: '#060606',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 50,
  },
  fsTopBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    background: '#0a0a0a',
    borderBottom: '1px solid #1a1a1a',
    flexShrink: 0,
  },
  backBtn: {
    background: 'transparent',
    color: '#f0a500',
    fontSize: 15,
    fontWeight: 700,
    padding: '6px 10px',
    borderRadius: 8,
    border: 'none',
    fontFamily: "'BHP-Mono', monospace",
    letterSpacing: 0.3,
    minHeight: 36,
  },
  fsPosNum: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 13,
    color: '#333',
    fontWeight: 700,
    letterSpacing: 1,
  },
  fsAdminBtns: {
    display: 'flex',
    gap: 6,
  },
  fsIconBtn: {
    background: '#181818',
    color: '#555',
    fontSize: 16,
    padding: '7px 11px',
    borderRadius: 7,
    border: '1px solid #252525',
    minHeight: 36,
    minWidth: 36,
    textAlign: 'center',
    fontFamily: "'BHP-Mono', monospace",
  },
  fsTitleBlock: {
    padding: '16px 18px 12px',
    borderBottom: '1px solid #141414',
    flexShrink: 0,
  },
  fsSongTitle: {
    fontFamily: "'BHP-Label', sans-serif",
    fontSize: 22,
    fontWeight: 700,
    color: '#f0f0f0',
    lineHeight: 1.15,
    marginBottom: 6,
  },
  fsSongMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  fsArtist: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 13,
    color: '#555',
    letterSpacing: 0.3,
  },
  fsBadge: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 12,
    color: '#f0a500',
    background: 'rgba(240,165,0,0.1)',
    border: '1px solid rgba(240,165,0,0.2)',
    borderRadius: 5,
    padding: '2px 8px',
    letterSpacing: 0.4,
  },
  fsClaimers: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 12,
    color: '#4fc3f7',
    marginTop: 7,
    letterSpacing: 0.3,
  },
  fsTabBar: {
    display: 'flex',
    gap: 0,
    padding: '10px 16px',
    borderBottom: '1px solid #141414',
    flexShrink: 0,
    overflowX: 'auto',
  },
  fsTabBtn: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 13,
    fontWeight: 700,
    color: '#444',
    background: 'transparent',
    border: '1px solid #222',
    borderRadius: 0,
    padding: '10px 20px',
    minHeight: 42,
    letterSpacing: 0.8,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  fsTabBtnActive: {
    color: '#f0a500',
    background: 'rgba(240,165,0,0.08)',
    borderColor: 'rgba(240,165,0,0.3)',
    zIndex: 1,
  },
  fsContent: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 18px 12px',
  },
  fsContentText: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 18,
    color: '#e8e8e8',
    lineHeight: 1.75,
    whiteSpace: 'pre-wrap',
    margin: 0,
    letterSpacing: 0.2,
  },
  fsEmpty: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 14,
    color: '#2a2a2a',
    textAlign: 'center',
    paddingTop: 40,
  },
  fsLinks: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '10px 14px 14px',
    borderTop: '1px solid #141414',
    flexShrink: 0,
  },
  fsLinkBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '14px 16px',
    background: '#111',
    border: '1px solid #222',
    borderRadius: 10,
    textDecoration: 'none',
    color: '#f0a500',
    minHeight: 52,
  },
  fsLinkIcon: {
    fontSize: 20,
    flexShrink: 0,
  },
  fsLinkLabel: {
    flex: 1,
    fontFamily: "'BHP-Label', sans-serif",
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 0.4,
  },
  fsLinkArrow: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 18,
    color: '#444',
    flexShrink: 0,
  },
  fsFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    paddingBottom: 'max(14px, env(safe-area-inset-bottom))',
    background: '#0a0a0a',
    borderTop: '1px solid #141414',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  fsClaimBtn: {
    flex: 1,
    background: '#141414',
    color: '#666',
    fontSize: 14,
    fontWeight: 700,
    padding: '10px 14px',
    borderRadius: 9,
    border: '1px solid #222',
    minHeight: 44,
    fontFamily: "'BHP-Mono', monospace",
    letterSpacing: 0.3,
    minWidth: 140,
  },
  fsClaimBtnActive: {
    color: '#4fc3f7',
    borderColor: 'rgba(79,195,247,0.3)',
    background: 'rgba(79,195,247,0.07)',
  },
  fsNavBtns: {
    display: 'flex',
    gap: 6,
  },
  fsNavBtn: {
    background: '#141414',
    color: '#555',
    fontSize: 12,
    fontWeight: 700,
    padding: '10px 12px',
    borderRadius: 9,
    border: '1px solid #222',
    minHeight: 44,
    fontFamily: "'BHP-Mono', monospace",
    letterSpacing: 0.3,
    whiteSpace: 'nowrap',
  },
  fsReorderBtns: {
    display: 'flex',
    gap: 5,
  },

  // ── Shared modal / sheet ──
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    zIndex: 100,
  },
  modal: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: '#131313',
    borderRadius: '18px 18px 0 0',
    zIndex: 101,
    padding: '0 16px',
    paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
    maxHeight: '93dvh',
    overflowY: 'auto',
  },
  modalHandle: {
    width: 36,
    height: 4,
    background: '#2a2a2a',
    borderRadius: 2,
    margin: '12px auto 18px',
  },
  modalTitle: {
    fontFamily: "'BHP-Label', sans-serif",
    fontSize: 20,
    color: '#f0f0f0',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  formFields: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  fieldRow: {
    display: 'flex',
    gap: 10,
  },
  fieldLabel: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 9,
    color: '#444',
    letterSpacing: 1.2,
  },
  input: {
    width: '100%',
    fontSize: 15,
    padding: '10px 12px',
    background: '#1a1a1a',
    border: '1px solid #272727',
    borderRadius: 8,
    color: '#f0f0f0',
    minHeight: 44,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  textarea: {
    minHeight: 'auto',
    resize: 'vertical',
    lineHeight: 1.5,
  },
  monoInput: {
    fontFamily: "'BHP-Mono', monospace",
    fontSize: 13,
    lineHeight: 1.6,
  },
  modalFooter: {
    display: 'flex',
    gap: 10,
    marginTop: 20,
    paddingBottom: 4,
  },
  cancelBtn: {
    flex: 1,
    background: '#1a1a1a',
    color: '#555',
    fontSize: 15,
    padding: '13px',
    borderRadius: 10,
    minHeight: 50,
    border: '1px solid #252525',
    fontFamily: 'inherit',
  },
  saveBtn: {
    flex: 2,
    background: '#f0a500',
    color: '#000',
    fontSize: 15,
    fontWeight: 700,
    padding: '13px',
    borderRadius: 10,
    minHeight: 50,
    fontFamily: 'inherit',
  },
  confirmSheet: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    background: '#131313',
    borderRadius: '18px 18px 0 0',
    zIndex: 101,
    padding: '0 16px',
    paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
  },
  confirmText: {
    color: '#aaa',
    fontSize: 15,
    textAlign: 'center',
    padding: '16px 0 20px',
    fontFamily: "'BHP-Mono', monospace",
    letterSpacing: 0.3,
  },
  confirmBtns: {
    display: 'flex',
    gap: 10,
  },
  removeBtnStyle: {
    flex: 1,
    background: '#c0392b',
    color: '#fff',
    fontSize: 15,
    fontWeight: 700,
    padding: '13px',
    borderRadius: 10,
    minHeight: 50,
    fontFamily: 'inherit',
  },
};
