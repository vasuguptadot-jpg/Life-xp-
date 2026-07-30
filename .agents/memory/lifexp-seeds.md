---
name: LifeXP seed data
description: DB seed state and schema quirks for archetypes and quest_templates
---

## Archetypes table
- No `updated_at` column — INSERT must omit it (only: id, name, description, focus_areas, created_at)
- 5 archetypes seeded: The Warrior, The Sage, The Monk, The Ranger, The Alchemist
- `focus_areas` is JSON array of attribute key strings

## Quest templates table
- Has `updated_at`; status defaults to 'DRAFT' — set 'ACTIVE' explicitly on insert
- 24 templates seeded: 8 DAILY, 7 WEEKLY, 5 MILESTONE, 4 CHALLENGE
- `progression_config` JSON shape: `{ xp: number, attributes: [{ attribute: string, xp: number }] }`

**Why:** archetypes was designed without updatedAt (immutable reference data); quest_templates is mutable so has it.
