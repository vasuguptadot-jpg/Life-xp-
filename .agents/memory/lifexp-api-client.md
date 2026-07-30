---
name: LifeXP API client call patterns
description: Orval-generated hook signatures for mutations that have path params or no body
---

## Mutation call patterns (orval generated)

Path-only (no body):
```ts
useAssignQuest().mutate({ templateId: "..." })
useCompleteQuest().mutate({ id: "..." })
```

Path + body:
```ts
useUpdateQuestProgress().mutate({ id: "...", data: { progress: 5 } })
useUpdateMe().mutate({ data: { displayName: "..." } })
useSignin().mutate({ data: { email, password } })
useSignup().mutate({ data: { email, username, password } })
useLogout().mutate({ data: { refreshToken: "..." } })
useSelectArchetype().mutate({ data: { archetypeId: "..." } })
useSetGoals().mutate({ data: { goals: [...], primaryGoal: "..." } })
useUpdateOnboardingStep().mutate({ data: { currentStep: 2 } })
useUpdateOnboardingProfile().mutate({ data: { heightCm, weightKg, activityLevel } })
useCompleteOnboarding().mutate({})
```

**Why:** orval 8.22 wraps path params and body into a single variables object passed to mutationFn; body always goes under `data:` key.
