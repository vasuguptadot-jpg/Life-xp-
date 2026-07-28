# LifeXP
## Design System & Visual Language

**Product Name:** LifeXP  
**Document Version:** 1.0  
**Date:** July 23, 2026  
**Status:** Production-Ready Design System  
**Prepared by:** Principal UX Architect & Design Systems Lead  
**Audience:** Design, Engineering, Marketing, AI Coding Agents  

---

## Table of Contents

1. Executive Design Summary  
2. Design Philosophy & Principles  
3. Color System  
4. Typography System  
5. Iconography  
6. Spacing & Layout System  
7. Component Library (MVP)  
8. Card System  
9. Gamification Visual Language  
10. Motion & Animation Guidelines  
11. Dark Mode  
12. Accessibility Standards  
13. Asset & Illustration Guidelines  
14. MVP Component Scope  
15. Usage & Implementation Rules  
16. Design Tokens  

---

## 1. Executive Design Summary

LifeXP’s visual language blends **RPG progression aesthetics** with **clean, modern wellness design**. The system creates an emotionally engaging experience that makes users feel they are building a character through real-life actions.

**Core Visual Identity:**
- **Tone:** Motivational, empowering, game-like but sophisticated
- **Aesthetic:** Dark-mode friendly with vibrant accent colors for progression
- **Feeling:** “Your body is your character” — clean, premium, rewarding

The design system is built for **mobile-first** implementation and supports the core daily loop:  
**Open → See Mission → Act → Progress → Return**

All components are designed to be:
- Highly reusable
- Accessible (WCAG 2.1 AA)
- Performant on mobile
- Extensible for future features (social, AI, leagues)

---

## 2. Design Philosophy & Principles

**Guiding Principles:**

1. **Progress Over Perfection**  
   Every screen should communicate forward movement.

2. **Game Feel Without Gamification Overload**  
   Celebrations are meaningful but not excessive.

3. **Clarity First**  
   Users should understand what to do in under 3 seconds.

4. **Emotional Reward**  
   Visual feedback should feel satisfying and identity-affirming.

5. **Mobile-First & Thumb-Friendly**  
   All interactive elements are optimized for one-handed use.

6. **Responsible Health Design**  
   Visual language never encourages overtraining or unhealthy behavior.

7. **Consistency & Scalability**  
   Every new feature must follow existing patterns.

---

## 3. Color System

### Primary Palette

| Role              | Token Name           | Hex       | Usage |
|-------------------|----------------------|-----------|-------|
| Primary           | `color-primary`      | `#6366F1` | Main CTAs, progress bars, highlights |
| Primary Dark      | `color-primary-dark` | `#4F46E5` | Pressed states, dark mode accents |
| Secondary         | `color-secondary`    | `#22C55E` | Success, XP, positive progress |
| Accent            | `color-accent`       | `#F59E0B` | Warnings, achievements, streaks |

### Semantic Colors

| Role           | Token                    | Hex       | Usage |
|----------------|--------------------------|-----------|-------|
| Success        | `color-success`          | `#22C55E` | Quest complete, level up |
| Warning        | `color-warning`          | `#F59E0B` | Streak at risk |
| Error          | `color-error`            | `#EF4444` | Errors, breaks |
| Info           | `color-info`             | `#3B82F6` | Informational elements |

### Neutral Palette (Light Mode)

| Token                  | Hex       | Usage |
|------------------------|-----------|-------|
| `color-neutral-50`     | `#F8FAFC` | Backgrounds |
| `color-neutral-100`    | `#F1F5F9` | Cards, surfaces |
| `color-neutral-200`    | `#E2E8F0` | Borders |
| `color-neutral-600`    | `#475569` | Secondary text |
| `color-neutral-900`    | `#0F172A` | Primary text |

### Neutral Palette (Dark Mode)

| Token                  | Hex       | Usage |
|------------------------|-----------|-------|
| `color-neutral-900`    | `#0F172A` | Background |
| `color-neutral-800`    | `#1E2937` | Cards, surfaces |
| `color-neutral-700`    | `#334155` | Borders |
| `color-neutral-400`    | `#94A3B8` | Secondary text |
| `color-neutral-50`     | `#F8FAFC` | Primary text |

### Gamification Colors (Attribute Specific)

| Attribute     | Color Token       | Hex       |
|---------------|-------------------|-----------|
| Strength      | `attr-strength`   | `#EF4444` |
| Endurance     | `attr-endurance`  | `#22C55E` |
| Mobility      | `attr-mobility`   | `#3B82F6` |
| Nutrition     | `attr-nutrition`  | `#F59E0B` |
| Recovery      | `attr-recovery`   | `#8B5CF6` |
| Discipline    | `attr-discipline` | `#EC4899` |
| Knowledge     | `attr-knowledge`  | `#06B6D4` |

---

## 4. Typography System

**Font Family:**
- **Primary:** Inter (or system sans-serif fallback)
- **Headings:** Inter SemiBold / Bold
- **Body:** Inter Regular

### Type Scale

| Token              | Size   | Weight   | Line Height | Usage |
|--------------------|--------|----------|-------------|-------|
| `text-display`     | 32px   | 700      | 1.1         | Level-up numbers, big stats |
| `text-h1`          | 28px   | 700      | 1.2         | Screen titles |
| `text-h2`          | 22px   | 600      | 1.3         | Section headers |
| `text-h3`          | 18px   | 600      | 1.4         | Card titles |
| `text-body`        | 16px   | 400      | 1.5         | Body text |
| `text-body-sm`     | 14px   | 400      | 1.5         | Secondary text, labels |
| `text-caption`     | 12px   | 500      | 1.4         | Metadata, timestamps |
| `text-button`      | 16px   | 600      | 1.0         | Button labels |

**Line Height Rules:**
- Headings: 1.1–1.3
- Body: 1.5
- Compact UI: 1.4

---

## 5. Iconography

**Icon Style:** 
- Line icons with 2px stroke weight
- Rounded corners (2px radius)
- Consistent 24×24px grid

**Icon Library Recommendation:** 
- Lucide Icons (or Heroicons) with custom additions for gamification

**Key Icon Categories:**
- Navigation icons
- Quest category icons (Movement, Strength, Nutrition, Recovery, Knowledge)
- Attribute icons
- Status icons (streak, level, checkmark)
- Action icons (log, share, celebrate)

**Icon Sizing:**
- `icon-xs`: 16px
- `icon-sm`: 20px
- `icon-md`: 24px (default)
- `icon-lg`: 32px
- `icon-xl`: 48px (celebration moments)

---

## 6. Spacing & Layout System

**Spacing Scale (8px base):**

| Token       | Value   | Usage |
|-------------|---------|-------|
| `space-1`   | 4px     | Tight gaps |
| `space-2`   | 8px     | Standard gaps |
| `space-3`   | 12px    | Component padding |
| `space-4`   | 16px    | Card padding |
| `space-5`   | 20px    | Section spacing |
| `space-6`   | 24px    | Large gaps |
| `space-8`   | 32px    | Major spacing |
| `space-12`  | 48px    | Hero sections |

**Layout Rules:**
- Maximum content width on mobile: 100%
- Safe area padding: 16px on all sides
- Card corner radius: 16px (primary), 12px (secondary)
- Button corner radius: 12px

---

## 7. Component Library (MVP)

### Buttons

**Primary Button**
- Background: `color-primary`
- Text: White, 600 weight
- Height: 52px
- Padding: 16px horizontal
- Corner radius: 12px

**Secondary Button**
- Background: `color-neutral-100` (light) / `color-neutral-800` (dark)
- Text: Primary text color

**Ghost Button**
- Background: Transparent
- Text: Primary color

**States:** Default, Hover, Pressed, Disabled, Loading

### Quest Card

- Background: Surface color
- Border radius: 16px
- Padding: 20px
- Elements: Category icon, title, progress bar, XP reward, completion checkbox
- Elevation: Subtle shadow (light) or border (dark)

### Progress Bar

- Height: 8px
- Background: `color-neutral-200`
- Fill: Attribute-specific color or primary
- Corner radius: 999px

### Attribute Bar

- Horizontal bar with colored fill matching attribute
- Label + current value on left
- Progress percentage on right

### Celebration Modal

- Full-screen overlay with confetti (level-up only)
- Large centered icon + text
- “Continue” primary button

---

## 8. Card System

**Quest Card** — Primary daily interaction  
**Progress Card** — Attribute overview  
**Summary Card** — Weekly/monthly recap  
**Shareable Card** — Visual progress export  
**Lesson Card** — Education content

All cards follow consistent padding, radius, and shadow rules.

---

## 9. Gamification Visual Language

**XP Gain Animation:**
- Number flies upward from action point
- Color matches attribute or green for general XP

**Level-Up:**
- Full-screen modal with character silhouette
- Large level number with glow effect
- Attribute gains shown as +X animations

**Streak Display:**
- Fire icon + number
- Pulsing animation when at risk

**Attribute Progression:**
- Subtle fill animation when XP is added
- Color-coded per attribute

---

## 10. Motion & Animation Guidelines

**Principles:**
- Fast and purposeful (never slow)
- Use spring physics for natural feel
- Respect “Reduce Motion” setting

**Key Animations:**
- Quest completion: 200ms scale + checkmark
- XP fly-up: 400ms ease-out
- Level-up: 600ms with spring
- Progress bar fill: 300ms ease-out

**Haptic Feedback:**
- Light: Quest complete, button press
- Medium: Level-up, achievement
- Heavy: Streak milestone (optional)

---

## 11. Dark Mode

LifeXP defaults to **Dark Mode** as the primary experience.

- All neutral tokens switch automatically
- Accent and attribute colors remain vibrant
- High contrast maintained in both modes
- System preference respected with manual override

---

## 12. Accessibility Standards

- Minimum contrast ratio: 4.5:1 for text
- Touch targets: Minimum 44×44px
- Focus states: Clear 3px outline on primary color
- Screen reader labels on all interactive elements
- Motion reduction support
- Font scaling up to 200% without layout breakage

---

## 13. Asset & Illustration Guidelines

**Character Illustrations:**
- Simple, bold, modern line art style
- 5 archetype base illustrations
- Future: Progressive visual evolution based on level

**Icons:** Line style, 2px stroke, consistent weight

**Illustrations:** Used sparingly — primarily in onboarding and empty states

**Export Format:** SVG for icons, PNG/WebP for illustrations

---

## 14. MVP Component Scope

**Included in MVP:**
- Buttons (Primary, Secondary, Ghost)
- Quest Cards
- Attribute Progress Bars
- XP Counter
- Streak Indicator
- Celebration Modals (Level-up, Quest complete)
- Form Inputs (Text, Select, Number)
- Navigation Tabs
- Toast Notifications
- Skeleton Loaders

**Excluded from MVP:**
- Complex charts
- Advanced social components
- Marketplace UI
- League visualizations

---

## 15. Usage & Implementation Rules

1. Never create one-off colors or spacing values
2. All new components must be added to the design system first
3. Gamification animations must follow the defined hierarchy
4. Health-related screens must maintain calm, trustworthy aesthetics
5. All text must be translatable (no hard-coded strings in visuals)

---

## 16. Design Tokens (Summary)

All values above are available as design tokens for consistent implementation across platforms (React Native, web, etc.).

**Recommended Token Format:**
```json
{
  "color": { ... },
  "typography": { ... },
  "spacing": { ... },
  "radius": { ... },
  "shadow": { ... }
}
```

---

**Document End**

This Design System provides a complete, cohesive visual foundation for LifeXP. It is optimized for the mobile-first gamified health experience and supports all phases of the product roadmap while maintaining emotional engagement and accessibility.