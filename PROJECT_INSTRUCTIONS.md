# SoleMD.Web - Public Website

> **SCOPE**: You are working in **SoleMD.Web** only.
> Do NOT modify files in other SoleMD.* projects unless explicitly requested.
>
> - Project: `solemd.web`
> - Schema: `web`
> - Workspace: `/workspaces/SoleMD.Web`
>
> **TRUSTED RELATIONSHIPS** (Safe to reference read-only):
> - Infra: Shared services (db, kong)
> - App: Data views (solemd schema, read-only)
>
> **FORBIDDEN**: Never modify other SoleMD.* project source files.
> **HAND-OFF**: See `/workspaces/CLAUDE.md` for cross-project protocol.

---

## TL;DR

- Next.js App Router with TypeScript and Tailwind CSS
- Mantine components + shared UI components in `components/ui/`
- Supabase for database and auth
- Run `npm run dev` to start, `npm run build` to verify

**When stuck**: Run `solemd doctor`, check `npm run lint`, restart dev server.

---

## Environment

| Context | Details |
|---------|---------|
| Workspace | `/workspaces/SoleMD.Web` |
| Container | Devcontainer on `solemd-infra` network |
| Framework | Next.js 15 with App Router |
| Styling | Tailwind CSS + Mantine |

## Skills & Commands

| Skill | When to Use |
|-------|-------------|
| `/code-search` | **ALWAYS use instead of grep/rg**. Find components, hooks, patterns |
| `/docker` | Start/stop services |

| Command | Action |
|---------|--------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint check |
| `npx tsc --noEmit` | TypeScript check (manual) |

## MCP Tools

**CRITICAL: NEVER use `grep`, `rg`, or `find` for code exploration.** Use code-search MCP tools instead.

### Code Search (Required)

Use `/code-search` skill for detailed tool selection guidance. Quick reference:

| Task | Tool | NOT |
|------|------|-----|
| **Search by meaning** | `mcp__code-search__semantic_search` | `rg "pattern"` |
| **Find symbol by name** | `mcp__code-search__list_functions` | `rg "function"` |
| **Before editing files** | `mcp__code-search__get_file_context` (MANDATORY) | Reading file directly |
| **Who calls this?** | `mcp__code-search__trace_callers` | `rg "Component("` |
| **Impact analysis** | `mcp__code-search__get_dependents` | `rg "import"` |
| **Find similar code** | `mcp__code-search__find_similar` | Manual inspection |

**Why code-search?**
- Semantic: Finds code by meaning, not just literal strings
- Pre-indexed: Call graph queries <1ms
- Smart: Auto-boosts source files, deprioritizes tests

**Broadening searches**: Start narrow, widen if no results. Remove `file_pattern`/`chunk_type` filters, rephrase with synonyms, try `list_functions` before `trace_callers`.

### Database

| Task | Tool |
|------|------|
| Database queries | `mcp__supabase-solemd__sqlToRest` → `mcp__supabase-solemd__postgrestRequest` (schema: `web`) |

## Project Structure

```
SoleMD.Web/
├── app/                  # App Router pages
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Home page
│   └── api/              # API routes
├── components/           # React components
│   ├── ui/               # Shared UI components
│   └── ...               # Feature components
├── lib/                  # Utilities
│   ├── supabase/         # Supabase client setup
│   └── utils.ts          # Helper functions
├── styles/               # Global styles
└── public/               # Static assets
```

## Key Patterns

### Component Structure

- **Pages**: In `app/` using App Router
- **Components**: In `components/`, organized by feature
- **API Routes**: In `app/api/`
- **Utilities**: In `lib/`

### Data Fetching

```typescript
// Server Component (default) - preferred
async function Page() {
  const data = await supabase.from('table').select('*');
  return <Component data={data} />;
}

// Client Component - only when needed
'use client';
import { useEffect, useState } from 'react';

function ClientComponent() {
  const [data, setData] = useState(null);
  useEffect(() => { /* fetch */ }, []);
}
```

### Supabase Client

```typescript
// Server-side (Server Components, API routes)
import { createServerClient } from '@/lib/supabase/server';
const supabase = createServerClient();

// Client-side (Client Components)
import { createBrowserClient } from '@/lib/supabase/client';
const supabase = createBrowserClient();
```

### Styling Rules

- **Tailwind CSS** for all styling - no CSS modules or styled-components
- Use Mantine primitives + shared components from `components/ui/`
- Follow mobile-first responsive design

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Components | PascalCase | `UserProfile.tsx` |
| Hooks | camelCase with `use` | `useAuth.ts` |
| Utilities | camelCase | `formatDate.ts` |
| Pages | lowercase | `page.tsx` |
| Routes | kebab-case | `user-profile/page.tsx` |

## Testing

| Command | Purpose |
|---------|---------|
| `npm test` | Run Jest tests |
| `npm run test:watch` | Watch mode |
| `npm run test:visual` | Playwright visual tests |
| `npm run test:visual:ui` | Playwright with UI |

**Patterns**:
- Unit tests for utilities in `__tests__/`
- Component tests with React Testing Library
- Mock Supabase client for isolated tests

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Dev server won't start | Check `solemd compose ps`, restart services |
| Type errors | Run `npx tsc --noEmit` for details |
| Supabase connection | Verify `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` |
| Component not rendering | Check 'use client' directive if using hooks |
| Hydration mismatch | Move dynamic content to client component |

## Shared Infrastructure

See `/workspaces/CLAUDE.md` for full infrastructure details.

Key services: PostgreSQL (`db:5432`), Supabase API (`kong:8000` aka `supabase-kong`)

### Agent Helpers

```bash
solemd doctor    # Health check
asroot <cmd>     # Run as root (no sudo)
```
