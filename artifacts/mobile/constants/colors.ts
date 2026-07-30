/**
 * LifeXP Design Tokens — dark RPG theme.
 * Both light and dark use the same dark palette so the app is always dark.
 */

const palette = {
  // Surfaces
  background: '#0C0C0F',
  foreground: '#F0F0F5',
  card: '#16161A',
  cardForeground: '#F0F0F5',
  surface: '#1E1E26',

  // Primary — amber gold (XP / leveling)
  primary: '#F59E0B',
  primaryForeground: '#0C0C0F',

  // Secondary — muted surfaces
  secondary: '#1E1E26',
  secondaryForeground: '#A0A0B8',

  // Muted
  muted: '#1E1E26',
  mutedForeground: '#6B6B80',

  // Accent — vivid purple
  accent: '#7C3AED',
  accentForeground: '#F0F0F5',

  // Destructive
  destructive: '#EF4444',
  destructiveForeground: '#FFFFFF',

  // Borders / inputs
  border: '#2A2A35',
  input: '#2A2A35',

  // Attribute colours
  strength: '#EF4444',
  endurance: '#F97316',
  mobility: '#84CC16',
  nutrition: '#10B981',
  recovery: '#06B6D4',
  discipline: '#8B5CF6',
  knowledge: '#3B82F6',

  // Legacy aliases
  text: '#F0F0F5',
  tint: '#F59E0B',
};

const colors = {
  light: palette,
  dark: palette,
  radius: 12,
};

export type AttributeKey = 'STRENGTH' | 'ENDURANCE' | 'MOBILITY' | 'NUTRITION' | 'RECOVERY' | 'DISCIPLINE' | 'KNOWLEDGE';

export const ATTRIBUTE_COLORS: Record<AttributeKey, string> = {
  STRENGTH: palette.strength,
  ENDURANCE: palette.endurance,
  MOBILITY: palette.mobility,
  NUTRITION: palette.nutrition,
  RECOVERY: palette.recovery,
  DISCIPLINE: palette.discipline,
  KNOWLEDGE: palette.knowledge,
};

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  STRENGTH: 'Strength',
  ENDURANCE: 'Endurance',
  MOBILITY: 'Mobility',
  NUTRITION: 'Nutrition',
  RECOVERY: 'Recovery',
  DISCIPLINE: 'Discipline',
  KNOWLEDGE: 'Knowledge',
};

export default colors;
