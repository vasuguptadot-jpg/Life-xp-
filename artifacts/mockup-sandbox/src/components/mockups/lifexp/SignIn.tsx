import './_group.css';
import { useState } from 'react';

const archetypeQuote = '"Every legend begins with a single step."';

export function SignIn() {
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [show, setShow] = useState(false);

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-void)',
      display: 'flex', fontFamily: 'var(--font-body)',
      overflow: 'hidden', position: 'relative',
    }}>
      {/* Left — decorative panel */}
      <div style={{
        flex: 1, background: 'linear-gradient(145deg, #060C18 0%, #0D1A30 50%, #080F1E 100%)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
        padding: '60px 48px', position: 'relative', borderRight: '1px solid var(--border-dim)',
      }}>
        {/* Background grid */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.08,
          backgroundImage: 'linear-gradient(var(--border-dim) 1px, transparent 1px), linear-gradient(90deg, var(--border-dim) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        {/* Glow orb */}
        <div style={{
          position: 'absolute', width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)',
          top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        }} />

        <div style={{ position: 'relative', textAlign: 'center', maxWidth: 420 }}>
          {/* Logo mark */}
          <div style={{
            width: 80, height: 80, borderRadius: 20,
            background: 'linear-gradient(135deg, #7C3AED, #4C1D95)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 28px', boxShadow: '0 0 40px rgba(124,58,237,0.4)',
            border: '1px solid rgba(124,58,237,0.6)',
          }}>
            <span style={{ fontSize: 36, color: 'var(--gold)' }}>⚡</span>
          </div>

          <h1 style={{
            fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 700,
            color: 'var(--text-bright)', letterSpacing: '0.05em', marginBottom: 8,
            background: 'linear-gradient(180deg, #E8EFF8 0%, var(--gold) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>LIFE XP</h1>

          <p style={{ color: 'var(--text-dim)', fontSize: 13, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 48 }}>
            Gamify Your Real Life
          </p>

          {/* Attribute previews */}
          {[
            { label: 'STRENGTH', color: 'var(--attr-strength)', val: 72 },
            { label: 'ENDURANCE', color: 'var(--attr-endurance)', val: 58 },
            { label: 'KNOWLEDGE', color: 'var(--attr-knowledge)', val: 85 },
            { label: 'DISCIPLINE', color: 'var(--attr-discipline)', val: 64 },
          ].map(a => (
            <div key={a.label} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-dim)' }}>{a.label}</span>
                <span style={{ fontSize: 10, color: a.color }}>{a.val}</span>
              </div>
              <div style={{ height: 4, background: 'var(--bg-elevated)', borderRadius: 2 }}>
                <div style={{ height: '100%', width: `${a.val}%`, background: a.color, borderRadius: 2, opacity: 0.9 }} />
              </div>
            </div>
          ))}

          <p style={{ marginTop: 48, fontStyle: 'italic', color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.6 }}>
            {archetypeQuote}
          </p>
        </div>
      </div>

      {/* Right — auth form */}
      <div style={{
        width: 480, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '60px 48px',
        background: 'var(--bg-base)',
      }}>
        <div style={{ marginBottom: 36 }}>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text-bright)',
            letterSpacing: '0.05em', marginBottom: 6,
          }}>
            {tab === 'signin' ? 'Welcome Back, Hero' : 'Begin Your Journey'}
          </h2>
          <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>
            {tab === 'signin' ? 'Continue your quest for greatness.' : 'Create your account and choose your path.'}
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{
          display: 'flex', background: 'var(--bg-surface)', borderRadius: 8,
          padding: 4, marginBottom: 28, border: '1px solid var(--border-dim)',
        }}>
          {(['signin', 'signup'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, letterSpacing: '0.05em',
              background: tab === t ? 'var(--bg-elevated)' : 'transparent',
              color: tab === t ? 'var(--text-bright)' : 'var(--text-dim)',
              transition: 'all 0.2s',
            }}>
              {t === 'signin' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* Form fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tab === 'signup' && (
            <Field label="Username" placeholder="Choose your hero name" />
          )}
          <Field label="Email" placeholder="your@email.com" type="email" />
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: 6, textTransform: 'uppercase' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={show ? 'text' : 'password'}
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '10px 40px 10px 14px',
                  background: 'var(--bg-surface)', border: '1px solid var(--border-dim)',
                  borderRadius: 8, color: 'var(--text-bright)', fontSize: 14, outline: 'none',
                }}
              />
              <button onClick={() => setShow(s => !s)} style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', fontSize: 16,
              }}>
                {show ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          {tab === 'signup' && (
            <Field label="Confirm Password" placeholder="••••••••" type="password" />
          )}
        </div>

        {tab === 'signin' && (
          <div style={{ textAlign: 'right', marginTop: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--gold)', cursor: 'pointer' }}>Forgot password?</span>
          </div>
        )}

        <button style={{
          marginTop: 24, width: '100%', padding: '13px 0',
          background: 'linear-gradient(90deg, #7C3AED, #5B21B6)',
          border: '1px solid rgba(124,58,237,0.6)',
          borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 600,
          letterSpacing: '0.08em', cursor: 'pointer',
          boxShadow: '0 0 20px rgba(124,58,237,0.3)',
        }}>
          {tab === 'signin' ? 'ENTER THE ARENA' : 'FORGE YOUR LEGEND'}
        </button>

        {tab === 'signup' && (
          <p style={{ marginTop: 20, fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', lineHeight: 1.5 }}>
            By signing up you agree to our{' '}
            <span style={{ color: 'var(--gold)', cursor: 'pointer' }}>Terms of Service</span>
            {' '}and{' '}
            <span style={{ color: 'var(--gold)', cursor: 'pointer' }}>Privacy Policy</span>
          </p>
        )}

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border-dim)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>OR</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border-dim)' }} />
        </div>

        <button style={{
          width: '100%', padding: '11px 0',
          background: 'transparent', border: '1px solid var(--border-dim)',
          borderRadius: 8, color: 'var(--text-mid)', fontSize: 14,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <span>🔷</span> Continue with Google
        </button>
      </div>
    </div>
  );
}

function Field({ label, placeholder, type = 'text' }: { label: string; placeholder: string; type?: string }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: 6, textTransform: 'uppercase' }}>
        {label}
      </label>
      <input
        type={type}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '10px 14px',
          background: 'var(--bg-surface)', border: '1px solid var(--border-dim)',
          borderRadius: 8, color: 'var(--text-bright)', fontSize: 14, outline: 'none',
        }}
      />
    </div>
  );
}
