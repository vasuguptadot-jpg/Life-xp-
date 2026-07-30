import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getAttributeColorClass(attribute: string): string {
  const map: Record<string, string> = {
    'STRENGTH': 'attr-strength',
    'ENDURANCE': 'attr-endurance',
    'MOBILITY': 'attr-mobility',
    'NUTRITION': 'attr-nutrition',
    'RECOVERY': 'attr-recovery',
    'DISCIPLINE': 'attr-discipline',
    'KNOWLEDGE': 'attr-knowledge',
  }
  return map[attribute] || 'attr-discipline';
}

export function formatXp(xp: number): string {
  return xp.toLocaleString();
}
