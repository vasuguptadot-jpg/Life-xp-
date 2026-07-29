import './_group.css';

const ATTRS = [
  { key: 'STRENGTH',   color: 'var(--attr-strength)',   val: 72, icon: '💪' },
  { key: 'ENDURANCE',  color: 'var(--attr-endurance)',  val: 58, icon: '🏃' },
  { key: 'MOBILITY',   color: 'var(--attr-mobility)',   val: 44, icon: '🤸' },
  { key: 'NUTRITION',  color: 'var(--attr-nutrition)',  val: 65, icon: '🥗' },
  { key: 'RECOVERY',   color: 'var(--attr-recovery)',   val: 80, icon: '💤' },
  { key: 'DISCIPLINE', color: 'var(--attr-discipline)', val: 55, icon: '🎯' },
  { key: 'KNOWLEDGE',  color: 'var(--attr-knowledge)',  val: 88, icon: '📚' },
];

const ACTIVE_QUESTS = [
  { title: 'Morning Warrior Protocol', category: 'FITNESS', xp: 150, progress: 60, difficulty: 'HARD', color: 'var(--attr-strength)' },
  { title: 'Read 20 Pages Daily', category: 'KNOWLEDGE', xp: 80, progress: 45, difficulty: 'EASY', color: 'var(--attr-knowledge)' },
  { title: 'Meal Prep Sunday', category: 'NUTRITION', xp: 120, progress: 0, difficulty: 'MEDIUM', color: 'var(--attr-nutrition)' },
];

const RECENT_XP = [
  { label: 'Quest: 10K Steps Streak', xp: '+200', time: '2h ago', color: 'var(--gold)' },
  { label: 'Quest: Meditate 10min', xp: '+80', time: '5h ago', color: 'var(--gold)' },
  { label: 'Daily Login Bonus', xp: '+15', time: '8h ago', color: 'var(--text-dim)' },
  { label: 'Quest: Read 20 Pages', xp: '+80', time: '1d ago', color: 'var(--gold)' },
];

const LEVEL = 14;
const TOTAL_XP = 18_450;
const XP_FOR_NEXT = 22_500;
const XP_PROGRESS = ((TOTAL_XP - 16900) / (XP_FOR_NEXT - 16900)) * 100;

export function Dashboard() {
  return (
    <div style={{
      display: 'flex', minHeight: '100vh', fontFamily: 'var(--font-body)',
      background: 'var(--bg-void)',
    }}>
      <Sidebar />

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text-bright)',
              letterSpacing: '0.04em', marginBottom: 2,
            }}>
              Welcome back, <span style={{ color: 'var(--gold)' }}>Kiran</span>
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>⚔️ The Warrior · 3 active quests</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{
              padding: '7px 14px', borderRadius: 8,
              background: 'var(--bg-card)', border: '1px solid var(--border-dim)',
              fontSize: 13, color: 'var(--text-mid)',
            }}>🔔</div>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--purple), #3B82F6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 14, color: 'white',
            }}>K</div>
          </div>
        </div>

        {/* Level card */}
        <div style={{
          background: 'linear-gradient(135deg, #0D1A30 0%, #16243E 100%)',
          border: '1px solid var(--border-glow)', borderRadius: 16,
          padding: '24px 28px', marginBottom: 20,
          boxShadow: '0 0 40px rgba(124,58,237,0.1)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', right: -40, top: -40, width: 200, height: 200,
            borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)',
          }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            {/* Level badge */}
            <div style={{
              width: 72, height: 72, borderRadius: 16, flexShrink: 0,
              background: 'linear-gradient(135deg, var(--purple), #4C1D95)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              border: '1px solid rgba(124,58,237,0.5)',
              boxShadow: '0 0 20px rgba(124,58,237,0.3)',
            }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.1em' }}>LVL</span>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'white', lineHeight: 1.1 }}>{LEVEL}</span>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
                  LEVEL PROGRESS
                </span>
                <span style={{ fontSize: 12, color: 'var(--gold)' }}>
                  {TOTAL_XP.toLocaleString()} / {XP_FOR_NEXT.toLocaleString()} XP
                </span>
              </div>
              <div style={{ height: 10, background: 'var(--bg-surface)', borderRadius: 5, marginBottom: 8 }}>
                <div style={{
                  height: '100%', width: `${XP_PROGRESS}%`,
                  background: 'linear-gradient(90deg, var(--purple), var(--gold))',
                  borderRadius: 5, transition: 'width 0.5s',
                  boxShadow: '0 0 8px rgba(245,166,35,0.4)',
                }} />
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  <span style={{ color: 'var(--gold)' }}>{(XP_FOR_NEXT - TOTAL_XP).toLocaleString()}</span> XP to Level {LEVEL + 1}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  <span style={{ color: '#10B981' }}>↑ 375 XP</span> this week
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Quests Done', val: '47', icon: '⚔️', color: 'var(--gold)' },
            { label: 'Day Streak', val: '12', icon: '🔥', color: '#F97316' },
            { label: 'Total XP', val: '18.4K', icon: '⚡', color: 'var(--purple)' },
            { label: 'Rank', val: '#1,204', icon: '🏆', color: '#10B981' },
          ].map(s => (
            <div key={s.label} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-dim)',
              borderRadius: 12, padding: '16px 18px',
            }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>{s.icon}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: s.color, marginBottom: 2 }}>{s.val}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.06em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Attributes */}
            <Section title="ATTRIBUTES" action="View All">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {ATTRS.map(a => (
                  <div key={a.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
                        {a.icon} {a.key}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: a.color }}>{a.val}</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--bg-surface)', borderRadius: 3 }}>
                      <div style={{
                        height: '100%', width: `${a.val}%`,
                        background: `linear-gradient(90deg, ${a.color}CC, ${a.color})`,
                        borderRadius: 3,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Active quests */}
            <Section title="ACTIVE QUESTS" action="View All">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ACTIVE_QUESTS.map(q => (
                  <div key={q.title} style={{
                    background: 'var(--bg-surface)', borderRadius: 10,
                    border: '1px solid var(--border-dim)', padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: 14,
                  }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                      background: `${q.color}20`, border: `1px solid ${q.color}40`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                    }}>
                      {q.category === 'FITNESS' ? '💪' : q.category === 'KNOWLEDGE' ? '📚' : '🥗'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-bright)', fontWeight: 500 }}>{q.title}</span>
                        <DiffBadge diff={q.difficulty} />
                      </div>
                      <div style={{ height: 4, background: 'var(--bg-elevated)', borderRadius: 2, marginBottom: 5 }}>
                        <div style={{ height: '100%', width: `${q.progress}%`, background: q.color, borderRadius: 2 }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{q.progress}% complete</span>
                        <span style={{ fontSize: 11, color: 'var(--gold)' }}>+{q.xp} XP</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          {/* Right column — XP feed */}
          <Section title="RECENT XP" action="History">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {RECENT_XP.map((tx, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 12px', borderRadius: 8,
                  background: i % 2 === 0 ? 'var(--bg-surface)' : 'transparent',
                }}>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-mid)', marginBottom: 2 }}>{tx.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{tx.time}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: tx.color }}>{tx.xp}</span>
                </div>
              ))}
            </div>

            {/* Daily goal ring */}
            <div style={{
              marginTop: 16, background: 'var(--bg-surface)', borderRadius: 10, padding: '16px',
              border: '1px solid var(--border-dim)', textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 12 }}>DAILY GOAL</div>
              <Ring pct={68} label="68%" sublabel="340 / 500 XP" />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Sidebar() {
  const items = [
    { icon: '🏠', label: 'Dashboard', active: true },
    { icon: '⚔️', label: 'Quests' },
    { icon: '📈', label: 'Progress' },
    { icon: '👤', label: 'Profile' },
    { icon: '🏆', label: 'Leaderboard' },
    { icon: '⚙️', label: 'Settings' },
  ];
  return (
    <div style={{
      width: 220, background: 'var(--bg-base)', borderRight: '1px solid var(--border-dim)',
      display: 'flex', flexDirection: 'column', padding: '20px 12px',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px', marginBottom: 28 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'linear-gradient(135deg, #7C3AED, #4C1D95)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
        }}>⚡</div>
        <span style={{ fontFamily: 'var(--font-display)', color: 'var(--text-bright)', fontSize: 16, letterSpacing: '0.04em' }}>
          LIFE XP
        </span>
      </div>

      <div style={{ flex: 1 }}>
        {items.map(item => (
          <div key={item.label} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 8, marginBottom: 2, cursor: 'pointer',
            background: item.active ? 'var(--bg-elevated)' : 'transparent',
            border: item.active ? '1px solid var(--border-glow)' : '1px solid transparent',
            color: item.active ? 'var(--text-bright)' : 'var(--text-dim)',
            fontSize: 13, fontWeight: item.active ? 600 : 400,
          }}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            {item.label}
            {item.active && (
              <div style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: 'var(--purple)' }} />
            )}
          </div>
        ))}
      </div>

      {/* User mini-profile */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 10,
        border: '1px solid var(--border-dim)', padding: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--purple), #3B82F6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 13, color: 'white',
          }}>K</div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-bright)', fontWeight: 600 }}>Kiran</div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>The Warrior</div>
          </div>
        </div>
        <div style={{ height: 3, background: 'var(--bg-surface)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${XP_PROGRESS}%`, background: 'linear-gradient(90deg, var(--purple), var(--gold))', borderRadius: 2 }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>LVL 14</span>
          <span style={{ fontSize: 9, color: 'var(--gold)' }}>82%</span>
        </div>
      </div>
    </div>
  );
}

const XP_PROGRESS = 82;

function Section({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-card)', borderRadius: 14,
      border: '1px solid var(--border-dim)', padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-dim)', fontWeight: 600 }}>{title}</span>
        {action && <span style={{ fontSize: 11, color: 'var(--purple)', cursor: 'pointer' }}>{action} →</span>}
      </div>
      {children}
    </div>
  );
}

function DiffBadge({ diff }: { diff: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    EASY:   { bg: 'rgba(16,185,129,0.15)', color: '#10B981' },
    MEDIUM: { bg: 'rgba(245,166,35,0.15)', color: '#F5A623' },
    HARD:   { bg: 'rgba(239,68,68,0.15)',  color: '#EF4444' },
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

function Ring({ pct, label, sublabel }: { pct: number; label: string; sublabel: string }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct / 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth="8" />
        <circle
          cx="55" cy="55" r={r} fill="none"
          stroke="url(#ringGrad)" strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform="rotate(-90 55 55)"
        />
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#F5A623" />
          </linearGradient>
        </defs>
        <text x="55" y="51" textAnchor="middle" fill="var(--text-bright)" fontSize="16" fontWeight="700">{label}</text>
        <text x="55" y="65" textAnchor="middle" fill="var(--text-dim)" fontSize="9">{sublabel}</text>
      </svg>
    </div>
  );
}
