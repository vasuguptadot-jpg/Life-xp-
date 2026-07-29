import './_group.css';
import { useState } from 'react';

const ARCHETYPES = [
  { name: 'The Warrior', icon: '⚔️', focus: ['STRENGTH', 'ENDURANCE'], desc: 'Push limits through raw power and iron will. Built for those who conquer every obstacle head-on.', colors: ['var(--attr-strength)', 'var(--attr-endurance)'] },
  { name: 'The Ranger', icon: '🏹', focus: ['MOBILITY', 'ENDURANCE'], desc: 'Swift, adaptive, always moving. Rangers thrive in the wild and never stop exploring.', colors: ['var(--attr-mobility)', 'var(--attr-endurance)'] },
  { name: 'The Scholar', icon: '📚', focus: ['KNOWLEDGE', 'NUTRITION'], desc: 'Wisdom is your greatest weapon. You level up by learning, studying, and understanding.', colors: ['var(--attr-knowledge)', 'var(--attr-nutrition)'] },
  { name: 'The Guardian', icon: '🛡️', focus: ['RECOVERY', 'DISCIPLINE'], desc: 'Steadfast and resilient. Guardians protect, endure, and restore their inner fortress.', colors: ['var(--attr-recovery)', 'var(--attr-discipline)'] },
  { name: 'The Monk', icon: '🧘', focus: ['DISCIPLINE', 'KNOWLEDGE'], desc: 'Mind over matter. Through mindfulness and ritual, you achieve mastery over self.', colors: ['var(--attr-discipline)', 'var(--attr-knowledge)'] },
  { name: 'The Alchemist', icon: '⚗️', focus: ['NUTRITION', 'RECOVERY'], desc: 'You transform inputs into power. Every meal and rest cycle is a formula for greatness.', colors: ['var(--attr-nutrition)', 'var(--attr-recovery)'] },
  { name: 'The Duelist', icon: '🤺', focus: ['STRENGTH', 'MOBILITY'], desc: 'Precise, explosive, and agile. Duelists combine power with grace in pursuit of peak performance.', colors: ['var(--attr-strength)', 'var(--attr-mobility)'] },
];

const STEPS = ['Profile', 'Goals', 'Archetype', 'Complete'];

export function Onboarding() {
  const [selected, setSelected] = useState<number | null>(3);
  const currentStep = 2;

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-void)', fontFamily: 'var(--font-body)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 40px', borderBottom: '1px solid var(--border-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--bg-base)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #7C3AED, #4C1D95)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>⚡</div>
          <span style={{ fontFamily: 'var(--font-display)', color: 'var(--text-bright)', fontSize: 16, letterSpacing: '0.05em' }}>LIFE XP</span>
        </div>

        {/* Step progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {STEPS.map((step, i) => (
            <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: i < currentStep ? 'var(--purple)' : i === currentStep ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                  border: i === currentStep ? '2px solid var(--purple)' : '1px solid var(--border-dim)',
                  color: i <= currentStep ? 'var(--text-bright)' : 'var(--text-dim)',
                }}>
                  {i < currentStep ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: 12, color: i === currentStep ? 'var(--text-bright)' : 'var(--text-dim)' }}>{step}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ width: 32, height: 1, background: i < currentStep ? 'var(--purple)' : 'var(--border-dim)' }} />
              )}
            </div>
          ))}
        </div>

        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Step 3 of 4</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '40px 40px 60px', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text-bright)',
            letterSpacing: '0.05em', marginBottom: 10,
          }}>Choose Your Archetype</h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 14, maxWidth: 500, margin: '0 auto', lineHeight: 1.6 }}>
            Your archetype shapes your quest recommendations and initial attribute focus.
            You can change this later, but choose wisely.
          </p>
        </div>

        {/* Archetype grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14,
          marginBottom: 40,
        }}>
          {ARCHETYPES.map((arch, i) => {
            const isSelected = selected === i;
            return (
              <div
                key={arch.name}
                onClick={() => setSelected(i)}
                style={{
                  background: isSelected
                    ? `linear-gradient(145deg, ${arch.colors[0]}18, ${arch.colors[1]}10)`
                    : 'var(--bg-card)',
                  border: isSelected
                    ? `1px solid ${arch.colors[0]}60`
                    : '1px solid var(--border-dim)',
                  borderRadius: 12, padding: '20px 16px', cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: isSelected ? `0 0 20px ${arch.colors[0]}20` : 'none',
                  position: 'relative',
                }}
              >
                {isSelected && (
                  <div style={{
                    position: 'absolute', top: 10, right: 10, width: 18, height: 18,
                    borderRadius: '50%', background: arch.colors[0],
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, color: 'white', fontWeight: 700,
                  }}>✓</div>
                )}
                <div style={{ fontSize: 28, marginBottom: 10 }}>{arch.icon}</div>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
                  color: isSelected ? 'var(--text-bright)' : 'var(--text-mid)',
                  letterSpacing: '0.04em', marginBottom: 8,
                }}>{arch.name}</div>
                <p style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 14 }}>
                  {arch.desc}
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {arch.focus.map((attr, fi) => (
                    <span key={attr} style={{
                      fontSize: 9, letterSpacing: '0.1em', fontWeight: 700,
                      padding: '2px 7px', borderRadius: 4,
                      background: `${arch.colors[fi]}20`,
                      color: arch.colors[fi],
                      border: `1px solid ${arch.colors[fi]}40`,
                    }}>{attr}</span>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Spacer for 7 items in 4-col grid */}
          <div />
        </div>

        {/* Selection summary + CTA */}
        {selected !== null && (
          <div style={{
            background: 'var(--bg-card)', borderRadius: 12,
            border: `1px solid ${ARCHETYPES[selected].colors[0]}40`,
            padding: '20px 28px', display: 'flex', alignItems: 'center', gap: 20,
            boxShadow: `0 0 30px ${ARCHETYPES[selected].colors[0]}15`,
          }}>
            <div style={{ fontSize: 36 }}>{ARCHETYPES[selected].icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', color: 'var(--text-bright)', fontSize: 15, marginBottom: 4 }}>
                {ARCHETYPES[selected].name} Selected
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                Your primary focus: {ARCHETYPES[selected].focus.join(' & ')}
              </div>
            </div>
            <button style={{
              padding: '11px 28px',
              background: `linear-gradient(90deg, ${ARCHETYPES[selected].colors[0]}, ${ARCHETYPES[selected].colors[1]})`,
              border: 'none', borderRadius: 8, color: 'white',
              fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer',
            }}>
              CONFIRM ARCHETYPE →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
