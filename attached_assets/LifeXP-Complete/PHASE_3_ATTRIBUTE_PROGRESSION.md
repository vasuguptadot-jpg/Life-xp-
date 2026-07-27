# LifeXP — Phase 3 Attribute Progression

## Overview

This document describes the attribute progression system for LifeXP.

### Attributes

| Attribute    | Description                              |
|--------------|------------------------------------------|
| STRENGTH     | Physical power and muscle development    |
| ENDURANCE    | Cardiovascular fitness and stamina       |
| MOBILITY     | Flexibility and movement quality         |
| NUTRITION    | Diet quality, hydration, and eating habits |
| RECOVERY     | Sleep, rest, and stress management       |
| DISCIPLINE   | Consistency and habit formation          |
| KNOWLEDGE    | Health education and understanding       |

### Architecture

- Centralized registry in `attribute.registry.ts`
- Attribute XP is awarded via the central `ProgressionService`
- Every attribute change is recorded in `AttributeHistory`
- Global XP and Attribute XP are separate but can be awarded together
- All operations are wrapped in database transactions

### Idempotency

Attribute progression uses source-based idempotency (sourceId + attribute) to prevent duplicate awards.

### Level Formula (Attribute)

```
Attribute Level = floor(sqrt(AttributeXP / 50)) + 1
```

### Security

- Server-side validation only
- Users cannot award XP to other users
- Unknown attributes are rejected
- All requests must pass through `JwtAuthGuard`

### Future Integration

This system is designed to be called by:
- Quest completion
- Health activity logging
- Lesson completion
- Streak milestones
- AI Coach recommendations

---

**Status:** Phase 3 Prompt 3 Complete