import './_group.css';

const ATTRS = [
  { key: 'STRENGTH',   icon: '💪', color: 'var(--attr-strength)',   val: 72, max: 100 },
  { key: 'ENDURANCE',  icon: '🏃', color: 'var(--attr-endurance)',  val: 58, max: 100 },
  { key: 'MOBILITY',   icon: '🤸', color: 'var(--attr-mobility)',   val: 44, max: 100 },
  { key: 'NUTRITION',  icon: '🥗', color: 'var(--attr-nutrition)',  val: 65, max: 100 },
  { key: 'RECOVERY',   icon: '💤', color: 'var(--attr-recovery)',   val: 80, max: 100 },
  { key: 'DISCIPLINE', icon: '🎯', color: 'var(--attr-discipline)', val: 55, max: 100 },
  { key: 'KNOWLEDGE',  icon: '📚', color: 'var(--attr-knowledge)',  val: 88, max: 100 },
];

const XP_HISTORY = [
  { week: 'Jul 22', xp: 420 },
  { week: 'Jul 15', xp: 310 },
  { week: 'Jul 8',  xp: 580 },
  { week: 'Jul 1',  xp: 290 },
  { week: 'Jun 24', xp: 470 },
  { week: 'Jun 17', xp: 380 },
];

const maxBar = Math.max(...XP_HISTORY.map(h => h.xp));

export function Profile() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'var(--font-body)', background: 'var(--bg-void)' }}>
      <Sidebar active="Profile" />

      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        {/* Character header */}
        <div style={{
          background: 'linear-gradient(135deg, #0D1A30 0%, #1A2840 100%)',
          border: '1px solid var(--border-glow)', borderRadius: 16,
          padding: '28px 32px', marginBottom: 20,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Background decoration */}
          <div style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: 300,
            background: 'radial-gradient(ellipse at right, rgba(124,58,237,0.12) 0%, transparent 70%)',
          }} />
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', position: 'relative' }}>
            {/* Avatar */}
            <div style={{ position: 'relative' }}>
              <div style={{
                width: 88, height: 88, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--purple), #3B82F6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 36, fontWeight: 700, color: 'white',
                border: '3px solid var(--gold)',
                boxShadow: '0 0 24px rgba(245,166,35,0.3)',
              }}>K</div>
              {/* Level badge on avatar */}
              <div style={{
                position: 'absolute', bottom: -4, right: -4,
                background: 'linear-gradient(135deg, var(--purple), #4C1D95)',
                borderRadius: 8, padding: '2px 7px',
                fontSize: 11, fontWeight: 700, color: 'white',
                border: '2px solid var(--bg-base)',
              }}>14</div>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--text-bright)', letterSpacing: '0.04em' }}>
                  Kiran
                </h2>
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>@kiran_warrior</span>
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
                <ArchetypeBadge icon="⚔️" name="The Warrior" />
                <StatPill icon="⚡" val="18,450 XP" color="var(--gold)" />
                <StatPill icon="🔥" val="12-day streak" color="#F97316" />
                <StatPill icon="⚔️" val="47 quests done" color="var(--purple)" />
              </div>
              {/* Level XP bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>LEVEL 14 → 15</span>
                  <span style={{ fontSize: 11, color: 'var(--gold)' }}>18,450 / 22,500 XP</span>
                </div>
                <div style={{ height: 8, background: 'var(--bg-surface)', borderRadius: 4 }}>
                  <div style={{
                    height: '100%', width: '82%',
                    background: 'linear-gradient(90deg, var(--purple), var(--gold))',
                    borderRadius: 4, boxShadow: '0 0 10px rgba(245,166,35,0.3)',
                  }} />
                </div>
              </div>
            </div>

            <button style={{
              padding: '9px 18px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-glow)',
              borderRadius: 8, color: 'var(--text-mid)', fontSize: 12,
              cursor: 'pointer', letterSpacing: '0.04em',
            }}>
              ✏️ Edit Profile
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Attributes panel */}
          <div style={{
            background: 'var(--bg-card)', borderRadius: 14,
            border: '1px solid var(--border-dim)', padding: '20px 24px',
          }}>
            <SectionTitle title="ATTRIBUTES" action="History" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {ATTRS.map(a => (
                <div key={a.key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 14 }}>{a.icon}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-mid)', letterSpacing: '0.08em' }}>{a.key}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Tier {Math.floor(a.val / 25) + 1}</span>
                      <span style={{
                        fontFamily: 'var(--font-display)', fontSize: 16,
                        color: a.color, minWidth: 28, textAlign: 'right',
                      }}>{a.val}</span>
                    </div>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-surface)', borderRadius: 3 }}>
                    <div style={{
                      height: '100%',
                      width: `${(a.val / a.max) * 100}%`,
                      background: `linear-gradient(90deg, ${a.color}90, ${a.color})`,
                      borderRadius: 3,
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Radar / stat overview */}
            <div style={{
              background: 'var(--bg-card)', borderRadius: 14,
              border: '1px solid var(--border-dim)', padding: '20px 24px',
            }}>
              <SectionTitle title="STAT OVERVIEW" />
              <RadarChart attrs={ATTRS} />
            </div>

            {/* Weekly XP chart */}
            <div style={{
              background: 'var(--bg-card)', borderRadius: 14,
              border: '1px solid var(--border-dim)', padding: '20px 24px',
            }}>
              <SectionTitle title="WEEKLY XP" />
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 90 }}>
                {XP_HISTORY.map((h, i) => (
                  <div key={h.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 9, color: 'var(--gold)' }}>{h.xp}</span>
                    <div style={{
                      width: '100%',
                      height: `${(h.xp / maxBar) * 70}px`,
                      background: i === 0
                        ? 'linear-gradient(180deg, var(--purple), #4C1D95)'
                        : 'var(--bg-elevated)',
                      borderRadius: '4px 4px 0 0',
                      border: '1px solid var(--border-dim)',
                    }} />
                    <span style={{ fontSize: 8, color: 'var(--text-dim)' }}>{h.week.split(' ')[1]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Achievements */}
            <div style={{
              background: 'var(--bg-card)', borderRadius: 14,
              border: '1px solid var(--border-dim)', padding: '20px 24px',
            }}>
              <SectionTitle title="ACHIEVEMENTS" action="View All" />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { icon: '🔥', label: 'On Fire', desc: '7-day streak' },
                  { icon: '💪', label: 'Iron Will', desc: '10 fitness quests' },
                  { icon: '📚', label: 'Scholar', desc: '500 Knowledge XP' },
                  { icon: '⚡', label: 'Level 10', desc: 'Reached LVL 10' },
                  { icon: '🏆', label: 'Top 1000', desc: 'Leaderboard' },
                  { icon: '🛡️', label: 'Resilient', desc: '30-day login' },
                ].map(a => (
                  <div key={a.label} style={{
                    background: 'var(--bg-elevated)', borderRadius: 10,
                    border: '1px solid var(--border-dim)', padding: '10px 12px',
                    textAlign: 'center', minWidth: 72,
                  }}>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>{a.icon}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-mid)', fontWeight: 600, marginBottom: 2 }}>{a.label}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>{a.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ title, action }: { title: string; action?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <span style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-dim)', fontWeight: 600 }}>{title}</span>
      {action && <span style={{ fontSize: 11, color: 'var(--purple)', cursor: 'pointer' }}>{action} →</span>}
    </div>
  );
}

function ArchetypeBadge({ icon, name }: { icon: string; name: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'rgba(124,58,237,0.15)', borderRadius: 8,
      padding: '4px 10px', border: '1px solid rgba(124,58,237,0.3)',
    }}>
      <span>{icon}</span>
      <span style={{ fontSize: 12, color: '#A78BFA', fontWeight: 600 }}>{name}</span>
    </div>
  );
}

function StatPill({ icon, val, color }: { icon: string; val: string; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5,
      background: 'var(--bg-elevated)', borderRadius: 8,
      padding: '4px 10px', border: '1px solid var(--border-dim)',
    }}>
      <span style={{ fontSize: 12 }}>{icon}</span>
      <span style={{ fontSize: 12, color, fontWeight: 500 }}>{val}</span>
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

type AttrPoint = { key: string; val: number; max: number; color: string };

function RadarChart({ attrs }: { attrs: AttrPoint[] }) {
  const cx = 100, cy = 100, r = 75;
  const n = attrs.length;

  const point = (i: number, radius: number) => {
    const angle = (i * 2 * Math.PI) / n - Math.PI / 2;
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  };

  const webPoints = (fraction: number) =>
    attrs.map((_, i) => point(i, r * fraction)).map(p => `${p.x},${p.y}`).join(' ');

  const valuePoints = attrs.map((a, i) => point(i, r * (a.val / a.max)));
  const valuePath = valuePoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + 'Z';

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <svg width="200" height="200" viewBox="0 0 200 200">
        {/* Background webs */}
        {[0.25, 0.5, 0.75, 1].map(f => (
          <polygon key={f} points={webPoints(f)} fill="none"
            stroke="var(--border-dim)" strokeWidth="0.5" />
        ))}
        {/* Axis lines */}
        {attrs.map((_, i) => {
          const outer = point(i, r);
          return <line key={i} x1={cx} y1={cy} x2={outer.x} y2={outer.y}
            stroke="var(--border-dim)" strokeWidth="0.5" />;
        })}
        {/* Value area */}
        <path d={valuePath} fill="rgba(124,58,237,0.15)" stroke="rgba(124,58,237,0.7)" strokeWidth="1.5" />
        {/* Value dots */}
        {valuePoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill={attrs[i].color} />
        ))}
        {/* Labels */}
        {attrs.map((a, i) => {
          const lp = point(i, r + 14);
          return (
            <text key={a.key} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle"
              fill="var(--text-dim)" fontSize="7" letterSpacing="0.08em">
              {a.key}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
