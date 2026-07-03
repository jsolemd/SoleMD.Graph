# SHOW Don't TELL

The foundational design principle for SoleMD.Graph wiki modules. Every concept
section demonstrates through interaction, not description. Text supports the
demo; the demo teaches the concept.

## The test

If you removed all the prose text from a section, would the interactive demo
still teach something? If yes, the section passes. If the demo is just a "tap
to reveal more text" card, it fails.

Refusing to ship a text-only section is part of your engineering discipline,
not a stretch goal.

## Interaction patterns (Nicky Case explorables)

| Pattern | When to use | Tier 2 shell or Tier 4 renderer |
|---------|-------------|--------------------------------|
| **Manipulate & observe** | "Change X, see Y change" — parameters, settings, configurations | `DemoStage`, `ToggleCompare` |
| **Step through** | "First this happens, then this" — processes, algorithms, reasoning chains | `StepThrough`, or `MechanismSection` for repeating shapes |
| **Simulate the experience** | "This is what it feels like to use X" — AI interaction, clinical tools | `ChatThread` |
| **Compare alternatives** | "A vs B, why B is better" — before/after, novice vs expert | `ToggleCompare`, `BeforeAfterSection` |
| **Apply and test** | "Try this yourself in a scenario" — case studies, frameworks | `CaseVignetteSection` plus Tier 2 shells inside reveals |

## TELL vs SHOW examples

| Concept | TELL (bad) | SHOW (good) |
|---------|-----------|-------------|
| Token probability | "Each output token is sampled from a probability distribution" | `DemoStage` with slider controlling temperature, `visx` bar chart showing the probability distribution shifting in real time |
| Context window | "Older content outside the window is invisible to the model" | `ToggleCompare` with Small/Medium/Large context, EMR note with visible/grayed regions, AI response changing based on what it can "see" |
| Chain of thought | "The model shows its reasoning steps" | `ChatThread` where each step types out sequentially, building a visible reasoning chain the user watches unfold |
| Prompt engineering | "Assign a persona, provide context, state a goal..." | Interactive prompt builder — click each stage to add a layer to a growing prompt in a `ChatThread`, watch the AI response improve with each addition |
| Drug mechanism | "Drug X binds receptor Y" | `MechanismSection` with `animationName` per stage that fires `AnimationStage` showing the binding event |

## Failure modes to refuse

- A "tap to reveal more text" card. That is a flashcard, not a demo.
- A static SVG diagram with no interaction. That is a figure, not a demo.
- A `ChatThread` where every "AI" response is hard-coded prose with no
  visualization swap, slider, or branching. That is a script, not a demo.
- A `MechanismSection` where every stage description is a paragraph the reader
  could just as well read in linear prose. That is decorative numbering.

If you catch one of these in your own draft, redesign the section before you
ship. The cost of a text-heavy section is permanent: every future reader gets
the lesser version.

## When to read this file

You are designing a new module section and need to pick the interaction
pattern, or you are auditing an existing section that smells like prose with
sprinkled buttons. The decision flows from this file into `interaction-shells.md`
or `section-renderers.md` depending on whether you need bespoke slots or a
shared shape.
