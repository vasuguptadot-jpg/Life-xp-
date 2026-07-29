import './_group.css';
import { useState } from 'react';

const ALL_QUESTS = [
  { id: 1, title: 'Morning Warrior Protocol', category: 'FITNESS', type: 'DAILY', diff: 'HARD', xp: 150, progress: 60, status: 'ACTIVE', desc: 'Complete a 45-minute strength training session before 9am.', attrs: [{ attr: 'STRENGTH', xp: 100 }, { attr: 'ENDURANCE', xp: 50 }] },
  { id: 2, title: 'Read 20 Pages Daily', category: 'KNOWLEDGE', type: 'DAILY', diff: 'EASY', xp: 80, progress: 45, status: 'ACTIVE', desc: 'Read at least 20 pages of a non-fiction book.', attrs: [{ attr: 'KNOWLEDGE', xp: 80 }] },
  { id: 3, title: 'Meal Prep Sunday', category: 'NUTRITION', type: 'WEEKLY', diff: 'MEDIUM', xp: 120, progress: 0, status: 'ACTIVE', desc: 'Prepare nutritious meals for the entire week in advance.', attrs: [{ attr: 'NUTRITION', xp: 120 }] },
  { id: 4, title: '10K Steps Streak', category: 'FITNESS', type: 'DAILY', diff: 'MEDIUM', xp: 200, progress: 100, status: 'COMPLETED', desc: 'Walk 10,000 steps every day for 7 consecutive days.', attrs: [{ attr: 'ENDURANCE', xp: 150 }, { attr: 'MOBILITY', xp: 50 }] },
  { id: 5, title: 'Meditate 10 Minutes', category: 'WELLNESS', type: 'DAILY', diff: 'EASY', xp: 60, progress: 100, status: 'COMPLETED', desc: 'Complete a 10-minute guided meditation session.', attrs: [{ attr: 'DISCIPLINE', xp: 60 }] },
  { id: 6, title: 'Cold Shower Challenge', category: 'FITNESS', type: 'CHALLENGE', diff: 'HARD', xp: 250, progress: 0, status: 'AVAILABLE', desc: 'Take a cold shower every morning for 30 days straight.', attrs: [{ attr: 'DISCIPLINE', xp: 150 }, { attr: 'ENDURANCE', xp: 100 }] },
  { id: 7, title: 'Learn a New Recipe', category: 'NUTRITION', type: 'WEEKLY', diff: 'MEDIUM', xp: 100, progress: 0, status: 'AVAILABLE', desc: 'Cook a new healthy recipe you have never made before.', attrs: [{ attr: 'NUTRITION', xp: 100 }] },
  { id: 8, title: 'Journal Nightly', category: 'WELLNESS', type: 'DAILY', diff: 'EASY', xp: 50, progress: 0, status: 'AVAILABLE', desc: 'Write a journal entry reflecting on your day\'s progress.', attrs: [{ attr: 'KNOWLEDGE', xp: 30 }, { attr: 'DISCIPLINE', xp: 20 }] },
];

const ATTR_COLORS: Record<string, string> = {
  STRENGTH: 'var(--attr-strength)', ENDURANCE: 'var(--attr-endurance)',
  MOBILITY: 'var(--attr-mobility)', NUTRITION: 'var(--attr-nutrition)',
  RECOVERY: 'var(--attr-recovery)', DISCIPLINE: 'var(--attr-discipline)',
  KNOWLEDGE: 'var(--attr-knowledge)',
};

const CAT_ICONS: Record<string, string> = {
  FITNESS: '💪', KNOWLEDGE: '📚', NUTRITION: '🥗', WELLNESS: '🧘',
};

type Filter = 'ALL' | 'ACTIVE' | 'AVAILABLE' | 'COMPLETED';

export function Quests() {
  const [filter, setFilter] = useState<Filter>('ALL');
  const [selectedId, setSelectedId] = useState<number | null>(1);

  const filtered = ALL_QUESTS.filter(q => filter === 'ALL' || q.status === filter);
  const selected = ALL_QUESTS.find(q => q.id === selectedId) ?? null;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'var(--font-body)', background: 'var(--bg-void)' }}>
      <Sidebar active="Quests" />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          padding: '20px 28px', borderBottom: '1px solid var(--border-dim)',
          background: 'var(--bg-base)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--text-bright)', letterSpacing: '0.04em', marginBottom: 2 }}>
              Quest Log
            </h2>
            <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>Track and manage your active quests</p>
          </div>
          <button style={{
            padding: '9px 18px',
            background: 'linear-gradient(90deg, var(--purple), #4C1D95)',
            border: '1px solid rgba(124,58,237,0.5)',
            borderRadius: 8, color: 'white', fontSize: 12, fontWeight: 600,
            letterSpacing: '0.06em', cursor: 'pointer',
          }}>
            + BROWSE CATALOGUE
          </button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Quest list */}
          <div style={{ width: 380, borderRight: '1px solid var(--border-dim)', overflowY: 'auto', background: 'var(--bg-base)' }}>
            {/* Filter tabs */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-dim)', display: 'flex', gap: 6 }}>
              {(['ALL', 'ACTIVE', 'AVAILABLE', 'COMPLETED'] as Filter[]).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 11, letterSpacing: '0.06em', fontWeight: 600,
                  background: filter === f ? 'var(--bg-elevated)' : 'transparent',
                  color: filter === f ? 'var(--text-bright)' : 'var(--text-dim)',
                  borderBottom: filter === f ? '1px solid var(--purple)' : '1px solid transparent',
                }}>
                  {f}
                  <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--text-dim)' }}>
                    {f === 'ALL' ? ALL_QUESTS.length : ALL_QUESTS.filter(q => q.status === f).length}
                  </span>
                </button>
              ))}
            </div>

            {/* Quest items */}
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map(q => (
                <div
                  key={q.id}
                  onClick={() => setSelectedId(q.id)}
                  style={{
                    background: selectedId === q.id ? 'var(--bg-elevated)' : 'var(--bg-card)',
                    border: selectedId === q.id ? '1px solid var(--border-glow)' : '1px solid var(--border-dim)',
                    borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 16 }}>{CAT_ICONS[q.category] ?? '📋'}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-bright)', fontWeight: 500 }}>{q.title}</span>
                    </div>
                    <DiffBadge diff={q.diff} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <StatusBadge status={q.status} />
                    <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 600 }}>+{q.xp} XP</span>
                  </div>
                  {q.status === 'ACTIVE' && q.progress > 0 && (
                    <div style={{ marginTop: 8, height: 3, background: 'var(--bg-surface)', borderRadius: 2 }}>
                      <div style={{ height: '100%', width: `${q.progress}%`, background: 'var(--purple)', borderRadius: 2 }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Quest detail */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px' }}>
            {selected ? (
              <div>
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 24 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 12, flexShrink: 0, fontSize: 26,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-dim)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{CAT_ICONS[selected.category] ?? '📋'}</div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{
                      fontFamily: 'var(--font-display)', fontSize: 20, color: 'var(--text-bright)',
                      letterSpacing: '0.03em', marginBottom: 8,
                    }}>{selected.title}</h3>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <DiffBadge diff={selected.diff} />
                      <StatusBadge status={selected.status} />
                      <span style={{
                        fontSize: 10, letterSpacing: '0.1em', fontWeight: 700,
                        padding: '2px 7px', borderRadius: 4,
                        background: 'rgba(124,58,237,0.15)', color: 'var(--purple)',
                      }}>{selected.type}</span>
                    </div>
                  </div>
                </div>

                <div style={{
                  background: 'var(--bg-card)', borderRadius: 12,
                  border: '1px solid var(--border-dim)', padding: '20px', marginBottom: 20,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 8 }}>DESCRIPTION</div>
                  <p style={{ fontSize: 14, color: 'var(--text-mid)', lineHeight: 1.7 }}>{selected.desc}</p>
                </div>

                {/* Rewards */}
                <div style={{
                  background: 'var(--bg-card)', borderRadius: 12,
                  border: '1px solid var(--border-dim)', padding: '20px', marginBottom: 20,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 14 }}>REWARDS</div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: 'rgba(245,166,35,0.1)', borderRadius: 10,
                      padding: '10px 16px', border: '1px solid rgba(245,166,35,0.2)',
                    }}>
                      <span style={{ fontSize: 20 }}>⚡</span>
                      <div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--gold)' }}>+{selected.xp}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>TOTAL XP</div>
                      </div>
                    </div>
                    {selected.attrs.map(a => (
                      <div key={a.attr} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: `${ATTR_COLORS[a.attr]}15`, borderRadius: 10,
                        padding: '10px 16px', border: `1px solid ${ATTR_COLORS[a.attr]}30`,
                      }}>
                        <span style={{ fontSize: 16, color: ATTR_COLORS[a.attr] }}>+</span>
                        <div>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: ATTR_COLORS[a.attr] }}>+{a.xp}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>{a.attr}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Progress / CTA */}
                {selected.status === 'ACTIVE' && (
                  <div style={{
                    background: 'var(--bg-card)', borderRadius: 12,
                    border: '1px solid var(--border-dim)', padding: '20px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>PROGRESS</span>
                      <span style={{ fontSize: 12, color: 'var(--text-mid)' }}>{selected.progress}%</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--bg-surface)', borderRadius: 4, marginBottom: 16 }}>
                      <div style={{
                        height: '100%', width: `${selected.progress}%`,
                        background: 'linear-gradient(90deg, var(--purple), var(--gold))', borderRadius: 4,
                      }} />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button style={{
                        flex: 1, padding: '11px 0',
                        background: 'linear-gradient(90deg, var(--purple), #4C1D95)',
                        border: 'none', borderRadius: 8, color: 'white',
                        fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
                      }}>
                        UPDATE PROGRESS
                      </button>
                      <button style={{
                        flex: 1, padding: '11px 0',
                        background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)',
                        borderRadius: 8, color: '#10B981',
                        fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
                      }}>
                        MARK COMPLETE ✓
                      </button>
                    </div>
                  </div>
                )}

                {selected.status === 'AVAILABLE' && (
                  <button style={{
                    width: '100%', padding: '13px 0',
                    background: 'linear-gradient(90deg, var(--purple), #4C1D95)',
                    border: '1px solid rgba(124,58,237,0.5)',
                    borderRadius: 10, color: 'white', fontSize: 13, fontWeight: 700,
                    letterSpacing: '0.08em', cursor: 'pointer',
                    boxShadow: '0 0 20px rgba(124,58,237,0.2)',
                  }}>
                    ⚔️ ACCEPT QUEST
                  </button>
                )}

                {selected.status === 'COMPLETED' && (
                  <div style={{
                    textAlign: 'center', padding: '24px',
                    background: 'rgba(16,185,129,0.08)', borderRadius: 12,
                    border: '1px solid rgba(16,185,129,0.3)',
                  }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: '#10B981', letterSpacing: '0.04em' }}>Quest Completed!</div>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>XP has been awarded to your account.</div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', fontSize: 14 }}>
                Select a quest to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ active }: { active: string }) {
  const items = [
    { icon: '🏠', label: 'Dashboard' },
    { icon: '⚔️', label: 'Quests' },
    { icon: '📈', label: 'Progress' },
    { icon: '👤', label: 'Profile' },
    { icon: '🏆', label: 'Leaderboard' },
    { icon: '⚙️', label: 'Settings' },
  ];
  return (
    <div style={{
      width: 200, background: 'var(--bg-base)', borderRight: '1px solid var(--border-dim)',
      display: 'flex', flexDirection: 'column', padding: '20px 12px', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px', marginBottom: 28 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'linear-gradient(135deg, #7C3AED, #4C1D95)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
        }}>⚡</div>
        <span style={{ fontFamily: 'var(--font-display)', color: 'var(--text-bright)', fontSize: 16, letterSpacing: '0.04em' }}>LIFE XP</span>
      </div>
      <div style={{ flex: 1 }}>
        {items.map(item => (
          <div key={item.label} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 8, marginBottom: 2, cursor: 'pointer',
            background: item.label === active ? 'var(--bg-elevated)' : 'transparent',
            border: item.label === active ? '1px solid var(--border-glow)' : '1px solid transparent',
            color: item.label === active ? 'var(--text-bright)' : 'var(--text-dim)',
            fontSize: 13, fontWeight: item.label === active ? 600 : 400,
          }}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function DiffBadge({ diff }: { diff: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    EASY: { bg: 'rgba(16,185,129,0.15)', color: '#10B981' },
    MEDIUM: { bg: 'rgba(245,166,35,0.15)', color: '#F5A623' },
    HARD: { bg: 'rgba(239,68,68,0.15)', color: '#EF4444' },
  };
  const s = map[diff] ?? map.MEDIUM;
  return (
    <span style={{
      fontSize: 9, letterSpacing: '0.1em', fontWeight: 700,
      padding: '2px 7px', borderRadius: 4,
      background: s.bg, color: s.color,
    }}>{diff}</span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    ACTIVE:    { bg: 'rgba(124,58,237,0.15)', color: '#A78BFA' },
    AVAILABLE: { bg: 'rgba(59,130,246,0.15)', color: '#60A5FA' },
    COMPLETED: { bg: 'rgba(16,185,129,0.15)', color: '#34D399' },
  };
  const s = map[status] ?? map.ACTIVE;
  return (
    <span style={{
      fontSize: 9, letterSpacing: '0.1em', fontWeight: 700,
      padding: '2px 7px', borderRadius: 4,
      background: s.bg, color: s.color,
    }}>{status}</span>
  );
}
