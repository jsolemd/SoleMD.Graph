# Module Contracts

This directory holds the checked-in implementation contracts for field
modules and landing-like surfaces.

These files are not just prose notes. They are the durable bridge between:

- human-authored chapter intent
- agent implementation against the shared field runtime
- future maintenance when chapter names or particle behavior change

## Architecture Boundary

The full runtime architecture does not live in each module contract.

Use:

- `.claude/skills/module/SKILL.md` for the module-building architecture
- `docs/map/modules/module-terminology.md` for the canonical authoring
  vocabulary and runtime alias rules
- `docs/map/modules/<module>.md` for the module-specific section/chapter/content
  contract

Module contracts should declare what a module contains and which stage/chapter
hooks it uses.

They should not try to duplicate the full stage/controller/overlay/runtime
manual.

## Inherited Runtime Boundaries

Every module contract in this directory inherits these non-negotiable runtime
rules:

- one fixed stage and one canvas per visible surface adapter
- the stage manifest is authoritative for stage ownership
- controllers read shared chapter progress inside `tick()`; DOM/SVG layers may
  consume shared progress but never own stage truth
- GSAP owns shared scroll intake and DOM-only chapter adapters
- Framer/Motion owns DOM affordances only, not field truth
- reduced-motion path and mobile path are required contract fields, not
  afterthought polish
- module-scoped locked deviations must be written explicitly, not implied in prose

## Source Of Truth Model

Use a two-surface workflow.

Human authoring source:

- an Obsidian/wiki note the user can edit directly

Checked-in implementation source:

- `docs/map/modules/<module>.md`

Rule:

- the Obsidian note is where the user expresses intent
- the checked-in module contract is what the agent implements from
- if only one exists, the checked-in contract wins inside the repo

Until a repo-backed wiki/modules tree exists, this directory is the canonical
checked-in home for module contracts.

## Agent Workflow

When a user says "change this chapter" or "add a new section," the agent should
work in this order:

1. If the brief is only a vibe, metaphor, or partial motion idea, run a short
   clarification interview first.
2. Update or create `docs/map/modules/<module>.md`.
3. Encode the requested chapter structure there first.
4. Implement code from that contract using the field architecture.
5. Write landed/deferred/locked outcomes back into the same contract.

Do not skip the contract update for durable structure changes.

The clarification interview should recover at least:

- opening state
- middle-state carriers or transitions
- ending state
- chapter landmarks
- overlay/interaction expectations
- live data/graph coupling expectations
- locked reference surfaces or deliberate deviations

## Required Shape

Use [module-template.md](/home/workbench/SoleMD/SoleMD.Graph/docs/map/modules/module-template.md:1)
for new modules.

Every module contract should include:

- module identity (including ending pattern, mobile path, reduced-motion path)
- global locked deviations
- stage manifest
- chapter inventory
- terminology bridge only when the module intentionally diverges from
  canonical names in `module-terminology.md`
- naming rules for how to refer to sections/beats

Every chapter entry should include:

- `chapter name`
- `section id`
- `chapter key` (or `none` if not adapter-wired)
- `stage state` — `owner` / `carry`, leading family first when two
  rows are present (e.g. `stream owner + blob carry`)
- `purpose` — one sentence on what the chapter is *for*. Required.
  Especially load-bearing for generic structural names like `Story 1`
  and `Story 2`.
- `content`
- `particle behavior`
- `overlay` — `none`, or one of `progress rail`, `hotspot cards`,
  `connection overlay`, or a named `future overlay`
- `interaction/motion intent`
- `mobile path`
- `reduced-motion path`
- `data bridge` (default: none)
- `deferred items`
- `locked deviations`

If a chapter has sub-beats, give them stable ids.

## Existing Example

- [landing.md](/home/workbench/SoleMD/SoleMD.Graph/docs/map/modules/landing.md:1)
  is `Module Zero` and the first concrete example of this contract style.
- [module-terminology.md](/home/workbench/SoleMD/SoleMD.Graph/docs/map/modules/module-terminology.md:1)
  defines the naming layer that all module contracts should inherit.
