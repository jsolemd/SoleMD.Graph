# prompt-drag

Draggable prompt box with a responsive bottom grab/recenter bar.

**Removed:** 2026-04-14. Reference commit with the full wiring live: `8cb6ea6`.

## What it did

On desktop, the prompt box could be dragged anywhere on the screen. A thin 2px pill sat centered at the bottom of the card and served two roles:

- **Drag affordance.** Once the user dragged the box away from its auto-centered position, the pill widened (20px → 32px) and brightened (opacity 0.4 → 0.7) as a subtle cue that the box was "off-center."
- **Recenter button.** Clicking the pill animated the box back to the auto target.

The drag system coexisted with automatic positioning (centering, focused-point avoidance). User drag always took precedence until the user clicked the pill to recenter.

## Why it was removed

The prompt box was re-framed as a fixed central element: always centered at the bottom, panels rendering behind it. Movement is now limited to focused-point avoidance (when a Cosmograph point is selected beneath the prompt, the box slides out of the way automatically). The drag + recenter UX was preserved here because the "responsive pill that expands and can be clicked" pattern is worth keeping as a reference.

## Files

- [`use-prompt-position.ts`](./use-prompt-position.ts) — the full hook as it last shipped. Manages three coordinated concerns: full-height mode transitions (create/maximized), collapsed/normal positioning, and user drag override. Exports `dragControls`, `dragX`/`dragY` motion values, `userDragX/Y` refs, `autoTargetXRef/YRef` refs, `isOffset`, `setIsOffset`, `isDragging`, and the animated `cardHeight`.
- [`PromptDragPill.tsx`](./PromptDragPill.tsx) — the bottom pill as a standalone component, parameterized on `isCollapsed`, `isOffset`, and `onRecenter`. The only external dependency is `@/lib/density` for density-scaled spacing.

## How it was wired (for future re-enablement)

In `PromptBoxSurface.tsx`, the outer `motion.div` enabled framer-motion's drag gesture:

```tsx
<motion.div
  drag={!isMobile}
  dragControls={dragControls}
  dragListener={false}        // gesture starts via dragControls.start() only
  dragMomentum={false}
  dragElastic={0}
  style={isMobile ? undefined : { x: dragX, y: dragY }}
  onDragStart={() => { document.body.style.cursor = "grabbing"; }}
  onDragEnd={() => { document.body.style.cursor = ""; handleDragEnd(); }}
>
  <motion.div
    ref={cardRef}
    onPointerDown={isMobile ? undefined : handleDragStart}
    style={{ cursor: isMobile || isFullHeightMode ? "default" : "grab", ... }}
  >
    {/* editor + toolbar rows */}

    {!isMobile && (
      <PromptDragPill
        isCollapsed={isCollapsed}
        isOffset={isOffset}
        onRecenter={handleRecenter}
      />
    )}
  </motion.div>
</motion.div>
```

In `use-prompt-box-controller.ts`, the controller owned three drag callbacks:

- `handleDragStart(event)` — if not in full-height mode, sets `isDragging.current = true` and calls `dragControls.start(event)`.
- `handleDragEnd()` — reads `dragX`/`dragY`, clamps to viewport bounds (using `VIEWPORT_MARGIN`, `BOTTOM_BASE`, `cardWidth(vw)`, `PROMPT_FALLBACK_NORMAL_HEIGHT`), animates back inside bounds if needed, stores the final position in `userDragX/Y`, and computes `isOffset` from the delta vs `autoTargetXRef/YRef`.
- `handleRecenter()` — animates `dragX`/`dragY` back to `autoTargetXRef.current`/`autoTargetYRef.current`, clears `userDragX/Y`, and sets `isOffset = false`.

`handlePillClick` also gated on `isDragging.current` to avoid firing expand-on-click when a drag had just ended.

See commit `8cb6ea6` for the complete diff across all three files.

## Re-enablement checklist

1. Copy `use-prompt-position.ts` back into `features/graph/components/panels/prompt/`. The live version was simplified to drop drag; the hook here is a superset.
2. Copy `PromptDragPill.tsx` into the same folder (or adjust the import path — its only dependency is `@/lib/density`).
3. In `PromptBoxSurface.tsx`, re-add the outer `motion.div` drag props, `onPointerDown={handleDragStart}` on the card, `cursor: "grab"` when appropriate, and the `<PromptDragPill />` render slot above the closing `</motion.div>`.
4. In `use-prompt-box-controller.ts`, re-expose `handleDragStart`, `handleDragEnd`, `handleRecenter`, `dragControls`, and `isOffset` from `PromptBoxControllerState` and destructure them from `usePromptPosition`.
5. Re-add the `handlePillClick` isDragging guard.
6. Reduce the bottom padding (`densityCssSpace(12, 12, 4)` → `densityCssSpace(12, 12, 10)` or similar) to give the pill visual room under the icon row.
