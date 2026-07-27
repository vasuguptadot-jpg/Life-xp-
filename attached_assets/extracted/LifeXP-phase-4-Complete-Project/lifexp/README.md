# LifeXP

**Turn your real life into a game. Level up your body. Upgrade your mind. Build your character.**

## Phase Status

- **Phase 0: COMPLETE** ✅
- **Phase 1 Prompt 1: COMPLETE** ✅ (Core Application Foundation)

## Technology Stack

- **Frontend**: React Native (Expo) + TypeScript
- **Backend**: NestJS + TypeScript
- **Database**: PostgreSQL + Prisma
- **Monorepo**: Turborepo
- **Design System**: Centralized design tokens

## Project Structure

```
lifexp/
├── apps/
│   ├── api/          # NestJS backend
│   └── web/          # React Native (Expo) frontend
├── packages/
│   ├── ui/           # Shared UI components & design system
│   ├── types/        # Shared TypeScript types
│   └── config/       # Shared configuration
└── turbo.json
```

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL
- pnpm or npm

### Environment Setup

1. Copy environment files:
   ```bash
   cp apps/api/.env.example apps/api/.env
   ```

2. Configure `DATABASE_URL` in `apps/api/.env`

3. Install dependencies:
   ```bash
   npm install
   ```

### Development

```bash
npm run dev
```

### Database

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate
```

### Testing

```bash
npm test
```

## Current Implementation Status

**Phase 1 Prompt 1 Complete:**
- Monorepo structure with Turborepo
- NestJS backend foundation with Prisma
- React Native frontend shell
- Design tokens foundation
- Basic routing scaffold
- Authentication architecture prepared
- Health check endpoint
- Error handling foundation
- Loading state patterns
- Responsive layout foundation
- README documentation

**Next Phase:** Phase 1 Prompt 2 — Authentication & User Account System

## Important Notes

- All secrets are managed via environment variables
- Database changes must use Prisma migrations
- Follow the Phase 0 architecture documents strictly
- Mobile-first development

---

*Built following the LifeXP Phase 0 Foundation documents.*