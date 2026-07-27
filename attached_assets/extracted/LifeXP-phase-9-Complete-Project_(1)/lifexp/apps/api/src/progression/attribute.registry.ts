export const ATTRIBUTES = [
  'STRENGTH',
  'ENDURANCE',
  'MOBILITY',
  'NUTRITION',
  'RECOVERY',
  'DISCIPLINE',
  'KNOWLEDGE',
] as const;

export type Attribute = typeof ATTRIBUTES[number];

export const ATTRIBUTE_DESCRIPTIONS: Record<Attribute, string> = {
  STRENGTH: 'Physical power and muscle development',
  ENDURANCE: 'Cardiovascular fitness and stamina',
  MOBILITY: 'Flexibility, range of motion, and movement quality',
  NUTRITION: 'Diet quality, hydration, and eating habits',
  RECOVERY: 'Sleep, rest, and stress management',
  DISCIPLINE: 'Consistency and habit formation',
  KNOWLEDGE: 'Health education and understanding',
};

export function isValidAttribute(attr: string): attr is Attribute {
  return ATTRIBUTES.includes(attr as Attribute);
}