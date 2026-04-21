# Cross-Skill Landing Contract Alignment Ledger

## Scope

- Align the `module`, `aesthetic`, and `animation-authoring` skills to the
  actual landing-page contract now implemented in `SoleMD.Graph`.
- Remove contradictions that would cause a future agent to build the right
  pieces with the wrong ownership boundaries, token assumptions, or animation
  package guidance.
- Lock a compact "Module Zero" reconstruction recipe so a vague brief can be
  converted into the full landing architecture with the right follow-up
  questions.

## Canonical Truth

- The current canonical runtime is the live field landing in
  `apps/web/features/field/`.
- The canonical route entry points are:
  - `apps/web/app/page.tsx`
  - `apps/web/app/field-lab/page.tsx`
  - `apps/web/features/field/routes/FieldLandingRoute.tsx`
- The canonical landing sections are:
  - `section-welcome`
  - `section-clients`
  - `section-story-1`
  - `section-graph`
  - `section-story-2`
  - `section-events`
  - `section-move-new`
  - `section-cta`
- `/surface-lab` is the shell/tokens verification surface. It is not the
  field runtime contract and not the motion authority.

## Upstream Doc Checks

- Motion official docs now teach the `motion/react` package and provide an
  upgrade path away from `framer-motion`.
- SoleMD.Graph currently installs `framer-motion@^12.23.3`, so the skill now
  teaches the repo-standard translation: adopt current upstream examples, but
  convert imports back to `framer-motion` until the repo explicitly migrates.
- GSAP's official React guidance still centers `useGSAP` from `@gsap/react`,
  scoped cleanup, and plugin registration inside the hook rather than at module
  top level.
- React Three Fiber still documents the React-major pairing rule:
  `@react-three/fiber@9` pairs with React 19.

## Sub-Agent Findings

### Darwin: `aesthetic`

- The synced `aesthetic` skill had drifted toward an older charcoal-dark,
  bordered-card framing and stale token examples.
- The key corrections were:
  - landing rhythm is viewport-driven, not fixed-spacing doctrine
  - dark mode uses a black-backed field with lively pastels, not blanket
    desaturation
  - matte, mostly borderless shell surfaces are the current truth
  - `/surface-lab` is the style/tokens verification surface

### Ptolemy: `animation-authoring`

- The motion skill had drifted by implying the field runtime was a
  generic module runtime and by treating older package/import assumptions as
  current truth.
- The key corrections were:
  - field runtime is currently a dedicated landing surface
  - GSAP/ScrollTrigger owns shared scroll intake and DOM chapter choreography
  - Framer Motion owns DOM-only affordances, not the Three.js field
  - `/surface-lab` validates styling, not motion/runtime architecture

## Completed Updates

### Module skill

- Added `.claude/skills/module/references/module-zero-reconstruction.md`.
- Wired the module skill to use that file as the cold-start rebuild recipe for
  the current landing.
- The reconstruction reference now teaches the actual pieces:
  - one fixed stage / one canvas
  - manifest-driven controller overlap
  - shared scroll state as the source of truth
  - GSAP for scroll/chapter wiring
  - Framer Motion for DOM affordances only
  - blob continuity through the landing with CTA bookend back to blob

### Aesthetic skill

- Updated `.claude/skills/aesthetic/SKILL.md` to point at the current
  token/layout contract.
- Updated:
  - `.claude/skills/aesthetic/references/colors.md`
  - `.claude/skills/aesthetic/references/css-architecture.md`
  - `.claude/skills/aesthetic/references/panel-patterns.md`
  - `.claude/skills/aesthetic/references/mantine-patterns.md`
- Clarified:
  - tokens live in `app/styles/tokens.css`, imported through `app/globals.css`
  - black-backed field / tokenized shell surfaces are the real dark-mode stack
  - Mantine gray tuples are compatibility ramps, not shell-background truth
  - panel styling is matte and mostly borderless, with rim-light doing the
    stacking work in dark mode

### Animation-authoring skill

- Updated `/workspaces/SoleMD.Infra/skills/animation-authoring/SKILL.md`.
- Updated:
  - `references/framer-motion.md`
  - `references/r3f-drei.md`
  - `references/next-react-integration.md`
  - `references/component-libraries.md`
- Clarified:
  - upstream Motion docs vs repo-standard `framer-motion` usage
  - dedicated field landing boundary
  - GSAP `useGSAP` / ScrollTrigger ownership for scroll choreography
  - R3F React 19 pairing and field-runtime boundaries

### Architecture docs

- Updated:
  - `docs/map/field-runtime.md`
  - `docs/map/field-implementation.md`
- Clarified that the current field runtime is mounted for the homepage
  and `/field-lab`, while future wiki/module adoption remains a later
  extension path.

## Sync And Verification

Commands intended for this pass:

- `solemd skill-sync`
- verify synced copies under:
  - `~/.codex/skills/aesthetic/`
  - `~/.codex/skills/animation-authoring/`

Actual result on 2026-04-20:

- `solemd skill-sync`
  - synced `animation-authoring`
  - synced `aesthetic`
  - synced `module`
  - total result: `22 skills synced, 1 excluded, 0 removed`
- Spot verification in `~/.codex/skills/` confirmed the aligned content is
  present:
  - Module Zero reconstruction reference
  - `/surface-lab` shell-authority wording
  - `app/styles/tokens.css` token ownership wording
  - dedicated field landing-runtime wording
  - upstream Motion `motion/react` note translated into repo-standard
    `framer-motion` guidance

Normalization caveat:

- The synced Codex copies normalize frontmatter and omit source-only keys such
  as `version` and `allowed-tools`. That is expected behavior from the sync
  process and not a content mismatch.

## Remaining Risk To Watch

- `mantineNeutralColorsTuple` remains a Mantine compatibility palette in code.
  The skill docs now explicitly call out that it is not the shell-background
  contract, but if the tuple itself is ever refreshed to match shell tokens,
  the same clarification should be preserved.

## Recommended Next Pass

- If the repo later migrates from `framer-motion` to Motion's `motion/react`,
  update the animation-authoring skill and the landing/runtime code together in
  one pass so the skill does not get ahead of the actual install surface.
