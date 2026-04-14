# Mobile Touch UX — Follow-up Plan

Date: 2026-04-13
Target device: Samsung Galaxy S26 Ultra (Android 15), wireless ADB + CDP

## Context

The 2026-04-12 mobile plan kicked off shell geometry work. On 2026-04-13 a
first pass of three touch fixes shipped:

- `features/graph/lib/pointer-gesture.ts` — shared `TAP_MAX_TRAVEL_PX`,
  `TAP_HIT_RADIUS_{MOUSE,TOUCH}_PX`, `exceededTapTravel`, `tapHitRadiusFor`
- `features/graph/cosmograph/hooks/use-pan-guard.ts` — background-click
  pan guard consuming Cosmograph's native zoom lifecycle
- `features/wiki/graph-runtime/interactions.ts` — tap via pointerup +
  pointer-type-aware hit radius
- `app/styles/entity-highlights.css` — `user-select: none`,
  `-webkit-touch-callout: none`, `touch-action: manipulation`

Verified on-device:
- ✅ Wiki graph tap opens the target page
- ✅ Long-press an entity highlight shows the `EntityHoverCard`, no OS
  text-selection callout

User-reported regressions still open after that pass — this plan scopes them.

## Open issues

### 1. Pan still deselects on the main Cosmograph (P0)

The `usePanGuard` fix only guards `onBackgroundClick`. On-device the user
reports that selecting a node (lit-up linked neighbors, i.e. `connectedSelect`
path) and then panning still clears the selection.

Primary suspect: `features/graph/cosmograph/hooks/use-points-filtered.ts`
lines 190–198. When `onPointsFiltered` fires with no intent clauses, it
unconditionally clears persistent selection intent:

```ts
if (!hasIntentClauses) {
  persistSelectionIntent({
    pointIndices: [],
    selectedCount: 0,
    selectionSourceId: null,
    clearNode: true,          // <— this is what the user sees
  });
  return;
}
```

On touch, a pan may momentarily drop the Cosmograph selection clause before
the pan completes (d3-zoom on touch vs. mouse differs here), which would fire
`onPointsFiltered` with `hasIntentClauses === false` and clear the store.
This hypothesis is consistent with the user's observation that the connected
selection visually "unselects" only on pan.

Diagnostic steps for the next agent (code already has no debug logs —
add temporary `console.log` at the entry of `handlePointsFilteredRef.current`
printing `{ selectedCount, sourceId, pointClauseCount, hasIntentClauses,
visibilityFocus }`, then reproduce via ADB + CDP per §Phone access).

Likely fix directions (pick after diagnosis, don't implement blind):
- If `pointsSelection.clauses` is transiently empty during a touch pan, gate
  the `clearNode: true` branch behind `consumeJustPan()` from `usePanGuard`
  (share the guard across both `GraphRenderer` and `usePointsFiltered`).
- If Cosmograph fires a spurious `onPointsFiltered` with
  `selectionSourceId === null` during pan, compare against the previous
  known-good source and suppress the clear when the pan guard is armed.

Constraint: don't regress the filter/timeline clear path which legitimately
calls `onPointsFiltered` without intent clauses. Gate only on `wasJustPan`.

### 2. Long-press on a wiki graph node should open the page (P1)

Today tap opens the page (fixed via pointerup + touch hit radius). The user
wants long-press to be a first-class alternative so they can pan confidently
without accidentally opening a page. This also matches the mobile convention
where tap = select/hover surrogate, long-press = commit.

File: `features/wiki/graph-runtime/interactions.ts`.

Plan:
- Add a `LONG_PRESS_MS = 400` constant in `features/graph/lib/pointer-gesture.ts`
  (keep thresholds centralized).
- On `pointerdown` of a node, start a timer that, if still unarmed after
  `LONG_PRESS_MS` with no drag and no pointerup, calls
  `intents.onOpenPage(node.slug)` immediately and marks the gesture as
  consumed so `firePointerUpIntents` no-ops on the subsequent pointerup.
- Keep tap-to-open behavior. Long-press is additive, not a replacement.
- Cancel the timer on `pointermove` beyond `TAP_MAX_TRAVEL_PX` and on
  `pointercancel`/`pointerup`.
- If feasible on touch, fire a subtle haptic / visual cue when long-press
  commits (out of scope if it requires a new dependency — note it instead).

### 3. No way to browse wiki pages outside search (P1)

Current entry points: `WikiSearch` and clicking a node in the wiki graph
(now working). There is no category index or "all pages" list.

Files of interest:
- `features/wiki/components/WikiNavigation.tsx` — header nav buttons
- `features/wiki/components/WikiPanel.tsx` — panel shell
- `features/wiki/stores/wiki-store.ts` — `navigateToPage`, `graphData`

Plan:
- Add a browse affordance in `WikiNavigation` (alongside home + back/forward):
  either a sheet/drawer listing all pages, or an "index" page route that
  renders a categorized list derived from `graphData.nodes` (kind === "page").
- Reuse `DotToc` / category grouping already used for modules where it fits.
- On mobile, render as a full-sheet with the existing `PanelBody` reading
  mode. On desktop, a popover/dropdown from the header action keeps it
  compact.
- Integration points: `navigateToPage(slug)` fires the same intent as graph
  taps and search, so no new controller is needed.

### 4. Full-graph view is worse sized on mobile than the default home (P2)

On mobile, tapping into the "full graph view" (likely `globalGraphOpen`
overlay in `features/wiki/components/WikiPanel.tsx` lines 278–319 and/or
`wikiExpanded` in `dashboard-store.ts`) renders at a smaller/denser size
than the default home Cosmograph. The user's expectation: the full-graph
overlay should render at the standard main-graph size on mobile, not a
cramped sub-panel.

Files:
- `features/wiki/components/WikiPanel.tsx` (overlay: lines 278–319;
  sizing math: lines 61–95)
- `lib/density.ts` — `densityCssViewportInset`, `densityViewportWidth/Height`
- `features/graph/stores/slices/panel-slice.ts` — `wikiExpanded*` fields

Plan:
- Audit `densityCssViewportInset` / `APP_CHROME_BASE_PX.wikiOverlayInset`
  against mobile vs desktop. The inset constant is likely desktop-sized and
  compresses the overlay on narrow screens.
- At mobile `useShellVariant === "mobile"`, render the full-graph overlay
  as full-viewport (or within `PANEL_EDGE_MARGIN`) with no density-driven
  inset, so the Cosmograph area matches the home view's footprint.
- If possible, reuse the home Cosmograph viewport constraints (same
  `width/height` math) so the experience is visually consistent.

### 5. Panel text-size control missing on mobile (P2)

Desktop panels show `A-` `100%` `A+` scale controls in the panel header
(PanelChrome + panel-header-actions). On mobile these should be reachable —
mobile users have smaller screens and benefit MORE from scale, not less.

Files:
- `features/graph/components/panels/PanelShell/PanelShell.tsx` line 113–115
  currently clamps to `Math.max(panelScale, 1.25)` on mobile — floor, not
  UI.
- `features/graph/components/panels/PanelShell/panel-header-actions.tsx`
  renders the `A-`/`A+` buttons, but they may be hidden by overflow in the
  narrow mobile header.
- `features/graph/components/panels/PanelChrome.tsx` lines 111–117 render
  the scale controls when handlers are provided.

Plan:
- Verify on-device (§Phone access) whether the scale controls are rendered
  but clipped, hidden via CSS, or not mounted.
- If clipped: move the `A-/100%/A+` group into the panel's overflow menu on
  mobile (add an overflow menu if one doesn't exist yet) so it remains
  reachable without fighting the header action row for space.
- If the clamp at `Math.max(panelScale, 1.25)` is hiding the user's intent,
  remove the floor and let the user set the scale themselves — only use
  the 1.25 default on first mount if the user hasn't touched it.
- Do NOT introduce a second density system; reuse the existing
  `PANEL_SCALE_{MIN,MAX,STEP}` contract.

## Suggested new skill: mobile-integration

The testing pattern used for the 2026-04-13 fixes is not captured in any
skill. Recommend creating a skill at `.claude/skills/mobile-integration/`
that codifies the following so future agents reach the working setup on
the first try:

- Phone access protocol (§Phone access below)
- Known touch-vs-mouse pitfalls: `pointerdown preventDefault` suppresses
  `click`; d3-zoom `clickDistance` differs across pointer types; OS
  text-selection callout hijacks long-press without `user-select: none`
- Hit-radius floor: `TAP_HIT_RADIUS_TOUCH_PX = 24` for anything the finger
  must aim at; 12px is a mouse-only value
- WCAG 2.2 Target Size (Minimum) references
- How to expose a debug window ref (`window.__graphDebug = { cosmographRef,
  graphStore, dashboardStore }`) for programmatic testing, and how to
  remove it before shipping
- Example CDP WebSocket scripts for `Input.dispatchTouchEvent` +
  `Runtime.evaluate` (the `.cdp-*.js` helpers used on 2026-04-13)

Scope note: the skill should be diagnostic/testing-focused, NOT a generic
"mobile everything" skill — its role is to get an agent from zero to
reproducing a touch bug on the real device in under 5 minutes.

## Phone access protocol (do this first)

### Device + transport
- Phone: Samsung Galaxy S26 Ultra, physical resolution 1440×3120,
  typical Chrome viewport ≈ 411×780 CSS px.
- Transport: Tailscale → wireless ADB on the laptop's forwarded port. The
  device should already appear in `adb devices`. If not, verify Tailscale
  is up and the phone has Wireless Debugging on.
- CDP: Chrome on the phone exposes DevTools Protocol forwarded to the
  laptop on `localhost:9223`. The page you want is served by the local
  Next.js dev server at `http://127.0.0.1:3000/` (same origin; Next.js
  port-forwards through Tailscale).

### Canonical command aliases (keep in scratch; don't commit)

```bash
ADB='/mnt/c/Users/Jon/AppData/Local/Android/Sdk/platform-tools/adb.exe'

# Phone is online?
"$ADB" devices

# Full screenshot (device pixels 1440×3120):
"$ADB" exec-out screencap -p > /home/workbench/.mcp-artifacts/tmp/phone.png
# then Read /home/workbench/.mcp-artifacts/tmp/phone.png

# Native touch tap / swipe (device pixels):
"$ADB" shell input tap <x_dev> <y_dev>
"$ADB" shell input swipe <x1> <y1> <x2> <y2> <duration_ms>
```

Device-pixel ≈ CSS-pixel × 3.504 horizontally, × 3.5 vertically once the
URL bar is accounted for. Prefer CDP (CSS-coord native) for precision taps.

### Chrome DevTools Protocol (precise, CSS-coord)

The page target id changes on reload. Discover it before each session:

```bash
curl -s http://localhost:9223/json | python3 -c "
import json, sys
for p in json.load(sys.stdin):
    if p.get('type') == 'page' and '127.0.0.1' in p.get('url',''):
        print(p['id'], p.get('url',''))
"
```

Use a project-local WebSocket helper (Node needs `ws` — create the script
inside the repo where `node_modules` resolves it, then delete when done):

```bash
cat > /home/workbench/SoleMD/SoleMD.Graph/.cdp-eval.js <<'EOF'
const WebSocket = require('ws');
const targetId = process.argv[2];
const expression = process.argv[3];
const ws = new WebSocket(`ws://localhost:9223/devtools/page/${targetId}`);
ws.on('open', () => {
  ws.send(JSON.stringify({
    id: 1, method: 'Runtime.evaluate',
    params: { expression, returnByValue: true, awaitPromise: true },
  }));
});
ws.on('message', (data) => {
  const r = JSON.parse(data);
  if (r.id === 1) {
    console.log(JSON.stringify(r.result?.result?.value ?? r.error ?? null, null, 2));
    ws.close(); process.exit(0);
  }
});
EOF
```

Dispatch a precise touch (CSS coords):

```bash
cat > /home/workbench/SoleMD/SoleMD.Graph/.cdp-touch.js <<'EOF'
const WebSocket = require('ws');
const targetId = process.argv[2];
const steps = JSON.parse(process.argv[3]);
const ws = new WebSocket(`ws://localhost:9223/devtools/page/${targetId}`);
let id = 0;
function send(method, params) {
  id += 1; const myId = id;
  return new Promise((resolve) => {
    const on = (data) => {
      const r = JSON.parse(data);
      if (r.id === myId) { ws.off('message', on); resolve(r.result ?? r.error); }
    };
    ws.on('message', on);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}
ws.on('open', async () => {
  for (const [m,p] of steps) await send(m,p);
  ws.close(); process.exit(0);
});
EOF
```

Capture the page console while you drive gestures (10-20 s window):

```bash
cat > /home/workbench/SoleMD/SoleMD.Graph/.cdp-console.js <<'EOF'
const WebSocket = require('ws');
const targetId = process.argv[2];
const durationMs = parseInt(process.argv[3] || '10000', 10);
const ws = new WebSocket(`ws://localhost:9223/devtools/page/${targetId}`);
const logs = [];
function send(method, params) { ws.send(JSON.stringify({ id: Math.random(), method, params })); }
ws.on('open', () => { send('Runtime.enable'); send('Log.enable');
  setTimeout(() => { console.log(JSON.stringify(logs, null, 2)); ws.close(); process.exit(0); }, durationMs);
});
ws.on('message', (data) => {
  const r = JSON.parse(data);
  if (r.method === 'Runtime.consoleAPICalled') {
    logs.push({ type: r.params.type, args: r.params.args.map(a => a.value ?? a.description ?? '').slice(0, 6) });
  }
});
EOF
```

Example one-shot flow (reload → wait → tap CSS point → capture logs):

```bash
# With target id discovered as $T:
node .cdp-eval.js $T 'location.reload(); "reloading"'
sleep 1.8

# Start 10 s console capture in background
node .cdp-console.js $T 10000 > /tmp/logs.json &
CONSOLE_PID=$!
sleep 2

# Tap at CSS (200, 400) — two touch events, no intermediate move
node .cdp-touch.js $T '[
  ["Input.dispatchTouchEvent", {"type":"touchStart","touchPoints":[{"x":200,"y":400}]}],
  ["Input.dispatchTouchEvent", {"type":"touchEnd","touchPoints":[]}]
]'

wait $CONSOLE_PID
python3 -c "
import json
for e in json.load(open('/tmp/logs.json')):
    a = e.get('args') or ['']
    if isinstance(a[0], str) and '[DEBUG' in a[0]: print(a[0])
"
```

### Exposing store/ref for programmatic testing

Temporarily add to `GraphRenderer.tsx` (delete before shipping):

```tsx
useEffect(() => {
  (window as any).__graphDebug = {
    cosmographRef,
    graphStore: useGraphStore,
    dashboardStore: useDashboardStore,
  };
}, []);
```

Then from CDP you can programmatically select and observe:

```js
const d = window.__graphDebug;
d.cosmographRef.current.selectPoint(100, true);
d.dashboardStore.getState().selectedPointCount; // 1
```

### Recovery when Android CDP drops
If `curl localhost:9223/json` stops responding after the phone locks:

```bash
bash /home/workbench/SoleMD/SoleMD.Infra/mcp/chrome-devtools-mcp/scripts/open-android-review.sh \
  http://localhost:3000
```

This re-opens the review page on the phone and re-establishes the CDP
forward. Don't ask the user — treat it as a normal recovery step.

### House-keeping
- Delete `.cdp-*.js` and any `window.__graphDebug` exposition before
  finishing the task. They exist only for the debugging session.
- Don't commit screenshots under `/home/workbench/.mcp-artifacts/tmp/`.

## Verification plan

Each fix must pass on both surfaces before being marked done:

### Phone (touch)
1. **Pan preserves selection**: use `window.__graphDebug` →
   `cosmograph.selectPoint(idx)`; confirm connected-select highlights;
   swipe the canvas; assert `dashboardStore.getState().selectedPointCount`
   unchanged AND the visible highlight persists.
2. **Long-press opens wiki page**: open wiki panel, hold a graph node for
   ≥400 ms without moving, release; verify `currentRoute.kind === "page"`.
3. **Wiki browse affordance**: with no search open, reach a page from the
   new browse entry in ≤2 taps.
4. **Full-graph overlay sizing**: open wiki → full-graph; visually match
   the home Cosmograph footprint (same padding/margins as `/`).
5. **Panel text scale on mobile**: `A-`/`A+` are tappable; changing them
   updates `dashboardStore.panelScales[id]` and visually scales the panel.

### Desktop (mouse, 1440×900)
- Full regression pass on existing `/clean` and mobile-desktop checks.
  No pan-guard or long-press should alter mouse behavior (mouse tap still
  selects, mouse drag still pans without side effects).

### Automated tests (extend, don't duplicate)
- `features/graph/cosmograph/__tests__/use-points-filtered.test.tsx` —
  add a case asserting `clearNode: true` is suppressed when a pan guard
  flag is set.
- `features/wiki/graph-runtime/__tests__/interactions.test.ts` — add
  long-press tests (timer advance via `jest.useFakeTimers()`).
- `features/graph/stores/__tests__/panel-slice.test.ts` — assert the
  scale step/reset actions work at the mobile clamp boundary.
- Snapshot/geometry test for `WikiPanel`'s full-graph overlay at
  `useShellVariant="mobile"` to lock in the home-matched footprint.

## Critical files

- `features/graph/cosmograph/hooks/use-points-filtered.ts` (line 190–198)
- `features/graph/cosmograph/hooks/use-pan-guard.ts`
- `features/graph/cosmograph/GraphRenderer.tsx`
- `features/graph/lib/pointer-gesture.ts`
- `features/wiki/graph-runtime/interactions.ts`
- `features/wiki/components/WikiPanel.tsx` (overlay lines 278–319)
- `features/wiki/components/WikiNavigation.tsx`
- `features/wiki/stores/wiki-store.ts`
- `features/graph/components/panels/PanelShell/PanelShell.tsx`
  (lines 112–117, 313–318)
- `features/graph/components/panels/PanelShell/panel-header-actions.tsx`
- `features/graph/components/shell/use-shell-variant.ts`
- `lib/density.ts`

## Out of scope

- Rewriting Cosmograph's internal hit-test (we control only the two
  consumer code paths above).
- Replacing d3-zoom or the Pixi wiki graph.
- Anything that regresses desktop multi-panel behavior. If a mobile fix
  conflicts with desktop, gate it on `useShellVariant() === "mobile"`.
