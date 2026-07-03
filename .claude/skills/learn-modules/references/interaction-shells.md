# Interaction Shells (Tier 2)

Compound components in `apps/web/features/wiki/module-runtime/interactions/`. Each
shell provides one **interaction pattern** (the animated behavioral structure)
with content **slots** that modules fill freely.

## The four built shells

| Shell | Interaction pattern | Sub-components | Reuse across modules |
|-------|---------------------|----------------|----------------------|
| `ChatThread` | Message flow, typing indicator, swappable AI responses, `Next` advance button | `Root`, `Message`, `Input`, `Controls` | AI teaching, prompt craft, clinical reasoning |
| `StepThrough` | Sequential stages with animated handoff, keyboard nav (arrow keys, role=tablist) | `Root`, `Step`, `Nav` | Mechanisms, workflows, diagnostic algorithms, treatment protocols |
| `ToggleCompare` | A control (segment/slider/toggle) drives a visual state change | `Root`, `Control`, `Display` | Drug comparison, model comparison, before/after, dose-response |
| `DemoStage` | Control panel area + visualization area + optional annotation, linked reactively | `Root`, `Controls`, `Visualization`, `Annotation` | Any "adjust parameter, see result" demonstration |

### StepThrough usage shape

`StepThrough` takes `stepCount` (and optional `loop`) on the root, renders one
`StepThrough.Step` per index, and renders `StepThrough.Nav` once for prev/next
buttons. The nav is a public sub-component, not internal — modules must place
it explicitly. Step content can read `useStepThroughContext()` to drive
per-step visualizations.

```tsx
<StepThrough stepCount={3}>
  <Stack>
    <StepThrough.Step index={0} title="Tokenize the prompt">
      <TokenViz />
    </StepThrough.Step>
    <StepThrough.Step index={1} title="Sample the next token">
      <ProbabilityChart />
    </StepThrough.Step>
    <StepThrough.Step index={2} title="Stop on EOS">
      <ProseBlock>...</ProseBlock>
    </StepThrough.Step>
    <StepThrough.Nav />
  </Stack>
</StepThrough>
```

## Future shells (not built)

`ProgressiveReveal` and `Checklist` were planned but do not exist in the
codebase. Do not link to them or build modules that depend on them. If a real
content need arrives, build the shell first, validate against two modules, then
add it to this table.

## File layout

Each shell follows this exact structure:

```
interactions/<ShellName>/
  use<ShellName>.ts        # Behavior hook: state, sequencing, keyboard nav
  <ShellName>.tsx          # Compound component: Root + sub-components
  index.ts                 # Barrel export of shell + hook
  __tests__/               # Optional unit tests for the hook
```

The barrel `interactions/index.ts` re-exports all shells:

```ts
export { ChatThread, useChatThread } from "./ChatThread";
export { StepThrough, useStepThrough } from "./StepThrough";
export { ToggleCompare, useToggleCompare } from "./ToggleCompare";
export { DemoStage, useDemoStage } from "./DemoStage";
```

## The compound component recipe

The hook owns state and behavior so it stays testable in isolation. The
component owns structure, animation, and the React context. Sub-components read
that context to render themselves.

The canonical assembly pattern (from the real `ChatThread.tsx`):

```tsx
const ChatThreadContext = createContext<ChatThreadState | null>(null);

function useChatThreadContext(): ChatThreadState {
  const ctx = useContext(ChatThreadContext);
  if (!ctx) {
    throw new Error("ChatThread.* must be used inside <ChatThread>");
  }
  return ctx;
}

function Message({ index, role, children }: MessageProps) {
  const { visibleCount, isTyping } = useChatThreadContext();
  // ...render based on context
}

function ChatThreadRoot({ children, className, ...config }: ChatThreadProps) {
  const state = useChatThread(config);
  return (
    <ChatThreadContext.Provider value={state}>
      <div className={`flex flex-col gap-3 ${className ?? ""}`}>
        {children}
      </div>
    </ChatThreadContext.Provider>
  );
}

export const ChatThread = Object.assign(ChatThreadRoot, {
  Message,
  Input,
  Controls,
});
```

Module-side usage stays content-free at the shell layer:

```tsx
<ChatThread messageCount={3}>
  <ChatThread.Message index={0} role="user">
    Summarize catatonia for the team.
  </ChatThread.Message>
  <ChatThread.Message index={1} role="ai">
    <TokenViz text="anti-NMDAR encephalitis" />
  </ChatThread.Message>
  <ChatThread.Controls nextLabel="Continue" />
</ChatThread>
```

## Why compound, not data-driven

Data-driven renderers like `MechanismSection({ stages })` lock the content
shape — every stage is title + description text. Compound components let each
step contain anything: a custom visualization, a slider, an embedded animation,
a 3D model. The shell handles sequencing and animation; the module handles
content.

This is the correct pattern for **per-module bespoke** content. When a content
shape is shared across 2+ modules with no per-step variation, you graduate to
Tier 4 (`section-renderers.md`).

## Build rules

- Build a shell when the same interaction pattern appears in 2+ modules. Do
  not pre-build shells speculatively. Extract them from working module sections.
- The hook MUST be testable without rendering. State, advance functions,
  keyboard handlers — all pure. Side effects (focus, scroll-into-view) move
  into the component.
- All motion routes through `module-runtime/motion.ts` presets. Honor
  `usePrefersReducedMotion()` everywhere.
- Sub-components MUST throw if used outside their root. The error message
  names the shell explicitly so the developer fixes their tree, not their
  imports.
- Keyboard contracts are non-negotiable for `StepThrough` (arrow keys),
  `ChatThread` (next button focusable), `ToggleCompare` (segmented control
  focus), `DemoStage` (control elements focusable).

## When to read this file

You are about to build a new interaction shell, modify an existing shell, or
audit a section that should be using a shell instead of inlining state. If the
section's content shape is the same across multiple modules, switch to
`section-renderers.md` instead.
