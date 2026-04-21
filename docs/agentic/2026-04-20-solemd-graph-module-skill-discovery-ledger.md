# Ambient-Field Module Skill Discovery Ledger

## Scope

Tighten the module-authoring skill so a vague natural-language surface idea does
not jump straight into implementation. The agent should run a short discovery
interview, convert the answers into a checked-in module contract, and only then
build against the shared field runtime.

## Current State / Authoring Contract

Before this pass, the module skill already required a two-surface workflow:

- human-authored chapter intent
- checked-in module contract under `docs/map/modules/`

The missing piece was explicit elicitation behavior for underspecified briefs.
The skill described how to implement authored chapters well, but it did not
force the agent to ask the minimum questions needed to reconstruct a durable
chapter contract from a poetic or vibe-level request.

## Ranked Themes And Findings

1. **Discovery behavior needed to be first-class, not implied.**
   The skill needed an explicit "discovery-first" rule for vague prompts such as
   "make a living blob that changes as you scroll."
2. **The contract template needed an intake snapshot.**
   The repo already had a checked-in module template, but it did not preserve
   the clarification pass that turns an initial idea into runtime-owned chapter
   requirements.
3. **The process should generalize beyond the current landing page.**
   The right abstraction is not "copy landing." It is "recover opening,
   middle-state carriers, ending, chapter landmarks, overlays, interactions, and
   data coupling from a short interview."

## Completed Batches

- Added a `Discovery-First Rule For Underspecified Briefs` section to
  `.claude/skills/module/SKILL.md`.
- Added minimum discovery questions covering opening state, middle state,
  ending, chapter landmarks, overlay needs, interaction, graph/data coupling,
  and inherited references.
- Added one compact reconstruction example to the module skill:
  vague blob prompt -> clarification questions -> current landing contract.
- Updated `docs/map/modules/README.md` so the repo-level workflow begins with a
  clarification interview when the brief is only a vibe or metaphor.
- Added a `Discovery Snapshot` block to `docs/map/modules/module-template.md`
  so future module contracts preserve the initial prompt, clarified structure,
  and any unresolved questions before implementation.

## Exact Commands

- inspected `.system/skill-creator/SKILL.md`
- searched the module skill and module-contract docs for existing authoring
  workflow sections
- patched the module skill, module-contract README, and module template

## Blockers

- None. This pass was documentation/skill-contract only.

## Newly Discovered Follow-On Work

- Consider mirroring the same discovery snapshot pattern into any future
  Obsidian/wiki module-authoring template.

## Next Recommended Passes

1. When the next new module is authored, validate that the agent follows the
   discovery interview before writing code.
