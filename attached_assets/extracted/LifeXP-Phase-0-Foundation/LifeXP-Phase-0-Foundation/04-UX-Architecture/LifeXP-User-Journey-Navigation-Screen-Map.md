# LifeXP
## User Journey, Navigation Architecture & Complete Screen Map

**Product Name:** LifeXP  
**Document Version:** 1.0  
**Date:** July 23, 2026  
**Status:** Implementation-Ready UX Architecture  
**Prepared by:** Principal UX Architect, Product Designer & Information Architect  
**Audience:** Product, Design, Engineering, AI Coding Agents  

---

## Table of Contents

1. User Personas  
2. First-Time User Journey  
3. Authentication Flow  
4. Main Navigation  
5. Complete Screen Inventory  
6. Information Architecture  
7. Core User Flows  
8. Daily Experience Design  
9. Empty States  
10. Error States  
11. Loading States  
12. Gamification UX  
13. Beginner Experience  
14. Accessibility  
15. Privacy UX  
16. MVP Screen Scope  
17. Recommended Navigation Architecture  
18. Complete User Journey Map  
19. Recommended MVP User Experience  

---

## 1. User Personas

### Persona 1: Maya Patel — The Consistent Beginner
- **Age:** 28 | **Location:** Pune, India  
- **Occupation:** Marketing Associate  
- **Goals:** Build consistent exercise habit, lose 6kg, improve energy  
- **Motivations:** Visual progress, daily structure, feeling accomplished  
- **Frustrations:** Starts strong then drops off after 10–12 days; overwhelmed by data-heavy apps  
- **Behaviour:** Opens app every morning, completes 2–3 quests most days, values streaks highly  
- **Onboarding Choices:** Balanced archetype, “Build discipline” + “Lose fat” goals  
- **Important Features:** Daily quests, streak counter, simple progress visuals  
- **Retention Triggers:** Streak milestones, level-up celebrations, weekly summary cards  
- **Risks:** Overwhelm from too many options; notification fatigue

### Persona 2: Arjun Rao — The Performance User
- **Age:** 34 | **Location:** Bangalore, India  
- **Occupation:** Software Engineer & weekend runner  
- **Goals:** Increase running endurance, hit strength PRs, track training load  
- **Motivations:** Attribute progression, personal records, comparison with past self  
- **Frustrations:** Existing apps lack RPG-style progression; wants measurable improvement  
- **Behaviour:** Logs workouts daily, reviews attribute charts weekly, competes in challenges  
- **Onboarding Choices:** Athlete archetype, “Improve stamina” + “Become stronger”  
- **Important Features:** Detailed attribute tracking, workout logging, improvement scoring  
- **Retention Triggers:** Level-ups in Endurance/Strength, personal record badges  
- **Risks:** Overtraining if quests push too hard

### Persona 3: Priya Singh — The Student
- **Age:** 21 | **Location:** Delhi, India  
- **Occupation:** University student (Computer Science)  
- **Goals:** Build discipline, improve sleep, learn about health  
- **Motivations:** Knowledge XP, academic-style progress, social bragging rights  
- **Frustrations:** Inconsistent due to exams and social life; wants accountability  
- **Behaviour:** Completes Knowledge quests regularly, shares progress cards with friends  
- **Onboarding Choices:** Scholar archetype, “Build discipline” + “Improve sleep”  
- **Important Features:** Health Academy, streak protection, shareable cards  
- **Retention Triggers:** Course completion, Knowledge attribute growth, friend challenges  
- **Risks:** Drops off during exam periods

### Persona 4: Vikram Malhotra — The Serious Athlete
- **Age:** 29 | **Location:** Mumbai, India  
- **Occupation:** Fitness coach & competitive powerlifter  
- **Goals:** Optimize training, recovery tracking, structured progression  
- **Motivations:** Data-driven insights, advanced tracking, coaching features  
- **Frustrations:** Current apps lack depth or feel too basic  
- **Behaviour:** Uses advanced logging, reviews recovery metrics, creates group challenges  
- **Onboarding Choices:** Warrior archetype  
- **Important Features:** Detailed workout logging, recovery metrics, group challenges  
- **Retention Triggers:** Advanced analytics, coach verification, league rankings  
- **Risks:** May outgrow MVP quickly

### Persona 5: Ananya Sharma — The Knowledge Seeker
- **Age:** 26 | **Location:** Hyderabad, India  
- **Occupation:** Product Designer & lifelong learner  
- **Goals:** Deep understanding of health science, sustainable habits  
- **Motivations:** Interactive lessons, evidence-based content, long-term identity change  
- **Frustrations:** Most fitness apps lack educational depth  
- **Behaviour:** Spends significant time in Health Academy, applies learnings to quests  
- **Onboarding Choices:** Guardian + Scholar archetypes  
- **Important Features:** Health Academy, AI Coach explanations, progress storytelling  
- **Retention Triggers:** Course completions, Knowledge XP, personalized recommendations  
- **Risks:** May find basic quests too simple initially

---

## 2. First-Time User Journey

### Step-by-Step Onboarding Flow

**Screen 1: Welcome**  
- **Objective:** Create immediate excitement and clarity of purpose  
- **Information:** Tagline, hero visual of character progression, “Turn your real life into a game”  
- **Actions:** “Get Started” (primary), “Already have an account”  
- **Next:** Sign Up

**Screen 2: Account Creation**  
- **Objective:** Quick, low-friction registration  
- **Options:** Email + password, Continue with Google, Continue with Apple  
- **Validation:** Email format, password strength  
- **Data Created:** `users` record  
- **Next:** Profile Setup

**Screen 3: Profile Setup**  
- **Objective:** Collect minimal essential data for personalization  
- **Fields:** Username, Age, Gender (optional), Height, Weight, Activity Level (dropdown)  
- **Actions:** Continue  
- **Data Created:** `profiles` record  
- **Next:** Goal Selection

**Screen 4: Goal Selection**  
- **Objective:** Understand user intent for quest personalization  
- **UI:** Multi-select chips (Become stronger, Build muscle, Lose fat, Improve stamina, Improve flexibility, Improve sleep, Build discipline, Become healthier)  
- **Limit:** Max 3 goals  
- **Data Created:** `user_goals`  
- **Next:** Archetype Selection

**Screen 5: Archetype Selection**  
- **Objective:** Make user feel like they are creating a game character  
- **UI:** 5 beautiful cards (Warrior, Athlete, Guardian, Scholar, Balanced) with short descriptions and icons  
- **Actions:** Select one → “This feels right”  
- **Data Created:** `characters` + archetype link  
- **Next:** Character Creation Confirmation

**Screen 6: Character Created**  
- **Objective:** Celebration and immediate value  
- **UI:** Animated character reveal, initial attribute bars (all at level 1), “Your journey begins”  
- **Actions:** “Start Today’s Mission”  
- **Next:** Dashboard (Today’s Mission)

**Success Criteria:** User completes first quest within 24 hours of onboarding.

---

## 3. Authentication Flow

**Sign Up Flow**  
Welcome → Account Creation → Profile Setup (as above)

**Sign In Flow**  
Welcome → Sign In (email/password or OAuth) → Dashboard (if profile complete) or Onboarding

**Forgot Password**  
Sign In → “Forgot password?” → Enter email → Confirmation screen → Email with reset link → New password screen

**Sign Out**  
Profile/Settings → Sign Out (with confirmation)

**Account Deletion**  
Settings → Account → Delete Account → Confirmation modal (warning about data loss) → 30-day soft delete period

**Session Expiration**  
Auto-redirect to Sign In with message “Your session has expired. Please sign in again.”

---

## 4. Main Navigation

**Recommended Pattern:** Bottom Tab Navigation (Mobile-First)

**Primary Tabs (MVP):**
1. **Home** (Today’s Mission + Dashboard)
2. **Quests** (Daily + History)
3. **Progress** (Character + Attributes + Achievements)
4. **Learn** (Health Academy)
5. **Profile** (Settings + Account)

**Rationale:**
- Bottom navigation is the most accessible pattern on mobile
- Home is the most important daily screen
- Quests and Progress are core gamification loops
- Learn supports long-term value
- Profile is the natural location for settings

**Secondary Navigation:**
- Floating Action Button (FAB) on Home for quick activity logging
- Top-right avatar for quick profile access
- Deep links from notifications

---

## 5. Complete Screen Inventory

### Authentication
- Welcome
- Sign Up
- Sign In
- Forgot Password
- Password Reset

### Onboarding
- Profile Setup
- Goal Selection
- Archetype Selection
- Character Created
- First Quest Introduction

### Home
- Dashboard (Today’s Mission)
- Quest Detail
- Quest Completion
- XP Reward Animation
- Level-Up Celebration Modal

### Progression
- Character Profile
- Attribute Overview
- Attribute Detail
- XP History
- Achievements
- Titles

### Health
- Health Overview
- Log Activity (Water, Steps, Workout)
- Workout Logger
- Sleep Logger
- Weight Logger

### Learn
- Academy Home
- Course List
- Course Detail
- Lesson View
- Quiz
- Course Completion

### Profile & Settings
- Profile
- Edit Profile
- Settings
- Privacy Settings
- Connected Devices (future)
- Subscription (future)
- Account Management

### Notifications
- Notification Center
- Notification Settings

---

## 6. Information Architecture

```
LifeXP
├── Home
│   ├── Today's Mission
│   ├── Quick Stats (Streak, Level, XP)
│   └── Quick Actions (Log Water, Log Steps)
│
├── Quests
│   ├── Daily Quests
│   ├── Weekly Quests (V2)
│   ├── History
│   └── Recommended
│
├── Progress
│   ├── Character
│   ├── Attributes (7 bars)
│   ├── XP History
│   ├── Achievements
│   └── Titles
│
├── Learn
│   ├── All Courses
│   ├── My Progress
│   └── Categories
│
└── Profile
    ├── My Character
    ├── Settings
    ├── Privacy
    └── Account
```

---

## 7. Core User Flows

### Daily Quest Flow
1. Open app → Home (Today’s Mission)
2. Tap quest card → Quest Detail
3. View requirements & XP reward
4. Perform real-world activity
5. Return to app → Tap “Mark Complete”
6. Validation (self-reported in MVP)
7. XP animation + attribute progress
8. Streak check
9. Possible achievement check
10. Return to Home

### Level-Up Flow
1. XP transaction created
2. Threshold crossed
3. Level-up event emitted
4. Full-screen celebration modal
5. New level displayed + attribute gains
6. Optional title unlock
7. “Continue” → Progress screen

### Streak Flow
- **Extension:** Complete ≥3 quests → Streak +1
- **Warning:** Day 2 of streak at risk → Push notification
- **Protection:** Streak shield used (V2)
- **Break:** Missed day → Streak reset + notification

### Health Activity Flow
1. Home → FAB → Log Activity
2. Select type (Water/Steps/Workout)
3. Enter value
4. Save → Health Module creates record
5. Progression evaluation (if applicable)

### Learning Flow
1. Learn tab → Course List
2. Select course → Course Detail
3. Start Lesson → Interactive lesson
4. Complete quiz → Score
5. Knowledge XP awarded
6. Progress updated

### AI Coach Flow (V3)
1. Coach tab → New conversation
2. User message
3. Context builder assembles recent data
4. AI processes with safety filter
5. Response returned + stored

### Social Challenge Flow (V2)
1. Social → Create Challenge
2. Select friends or public
3. Set goal + duration
4. Invite participants
5. Progress tracked per participant
6. Results shown at end

---

## 8. Daily Experience Design

**Morning (6:00–10:00)**
- Push notification: “Good morning! Your mission awaits.”
- Home screen shows Today’s Mission with 4–6 quests
- Streak prominently displayed

**During the Day**
- Smart, non-intrusive reminders for incomplete quests
- Quick log buttons on Home
- Progress updates after each completion

**Evening (20:00–23:00)**
- End-of-day summary card (optional)
- Streak status
- Tomorrow’s preview

**Notification Philosophy:**
- Maximum 3 push notifications per day
- Prioritize streak protection and quest reminders
- Respect user quiet hours

---

## 9. Empty States

- **No Quests Today:** “All quests completed! Great work.” + “Explore Academy”
- **No Friends:** “Connect with friends to compete and motivate each other”
- **No Achievements:** “Your first achievement is waiting. Complete 3 quests today.”
- **No Health Data:** “Start tracking by logging your first glass of water”
- **No Courses Started:** “Begin your first lesson in Nutrition Basics”

---

## 10. Error States

- **Network Error:** “Connection lost. Your progress is saved locally and will sync when you’re back online.”
- **Quest Validation Failed:** “We couldn’t verify this quest. Try again or log manually.”
- **AI Unavailable:** “Coach is taking a quick break. Here’s a helpful tip instead.”
- **Payment Failure:** “Payment failed. Please try again or update your card.”

---

## 11. Loading States

- Dashboard: Skeleton cards for quests + streak
- Quest completion: Optimistic update + loading spinner on confirmation
- AI Response: Typing indicator with “Thinking…” message
- Leaderboards: Skeleton list with shimmer effect

---

## 12. Gamification UX

**Feedback Hierarchy:**
1. **Quest Completion:** Immediate checkmark + XP fly-up animation
2. **Attribute Progress:** Subtle progress bar fill
3. **Level Up:** Full-screen celebration (highest priority)
4. **Streak Milestone:** Confetti + badge
5. **Achievement Unlock:** Modal with share option

**Animation & Haptics:**
- Light haptic on quest complete
- Stronger haptic + sound on level-up (user can disable)
- Celebration intensity scales with milestone importance

---

## 13. Beginner Experience

- Default quests are achievable (e.g., 3,000 steps instead of 10,000)
- Personal improvement scoring highlighted over absolute numbers
- “First Week” guided experience with easier quests
- Onboarding emphasizes “Your starting point is perfect”

---

## 14. Accessibility

- WCAG 2.1 AA compliance
- High contrast mode support
- Minimum 44×44px touch targets
- Screen reader labels on all interactive elements
- Reduced motion option
- Scalable fonts up to 200%

---

## 15. Privacy UX

- Clear toggles in Settings:
  - Profile visibility (Public / Friends only / Private)
  - Activity sharing
  - Health data visibility
- One-tap “Make everything private”
- Transparent data usage explanations

---

## 16. MVP Screen Scope

| Screen                        | MVP? | Reason |
|-------------------------------|------|--------|
| Welcome / Sign Up / Sign In   | Yes  | Required |
| Onboarding (5 screens)        | Yes  | Core loop |
| Dashboard (Today’s Mission)   | Yes  | Primary experience |
| Quest Detail & Completion     | Yes  | Core loop |
| Level-up Celebration          | Yes  | Gamification |
| Character Profile             | Yes  | Identity |
| Attribute Overview            | Yes  | Progression |
| XP History                    | Yes  | Transparency |
| Health Activity Logging       | Yes  | Tracking |
| Health Academy (basic)        | Yes  | Education |
| Profile & Settings            | Yes  | Account |
| Achievements                  | No   | V2 |
| Social / Challenges           | No   | V2 |
| AI Coach                      | No   | V3 |
| Leagues / Leaderboards        | No   | V3 |
| Subscription                  | No   | V2 |

---

## 17. Recommended Navigation Architecture

**Primary:** Bottom Tab Bar (5 tabs)  
**Secondary:** 
- FAB on Home for quick logging
- Avatar in top-right → Profile
- Back button on all detail screens
- Deep linking support from notifications and share cards

**Back Behaviour:** Standard mobile back navigation with state preservation

---

## 18. Complete User Journey Map

**Stage 1: Discovery**  
Motivation: See friend’s progress card  
Experience: Beautiful share card → App Store  
Success Metric: Install rate

**Stage 2: Installation & Onboarding**  
Motivation: “This looks fun and useful”  
Experience: Fast, delightful character creation  
Success Metric: Onboarding completion rate > 85%

**Stage 3: First Quest**  
Motivation: Immediate action  
Experience: Simple quest → Real-world action → XP  
Success Metric: First quest completed within 24h

**Stage 4: First Week**  
Motivation: Build momentum  
Experience: Streaks, small wins, attribute growth  
Success Metric: Day-7 retention ≥ 40%

**Stage 5: First Level-Up**  
Motivation: Visible progression  
Experience: Celebration + new identity feeling  
Success Metric: Level 5 reached

**Stage 6: Long-Term Retention**  
Motivation: Identity transformation  
Experience: Consistent use, learning, social features  
Success Metric: Day-30 retention ≥ 25%

---

## 19. Recommended MVP User Experience

The MVP experience is intentionally focused on the **daily core loop**:

1. Open app
2. See Today’s Mission (4–6 quests)
3. Complete real-world actions
4. Log or mark complete
5. Receive immediate XP + progress feedback
6. Maintain streak
7. Return tomorrow

All other features (social, advanced AI, leagues) are deliberately excluded from MVP to ensure the foundational habit loop is rock-solid before expansion.

---

**Document End**

This UX Architecture document provides a complete, implementation-ready foundation for the LifeXP user experience. All screens, flows, and navigation decisions are aligned with the PRD, Technical Architecture, and Database Schema.