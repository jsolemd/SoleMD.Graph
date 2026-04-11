# Smoke tests

Throwaway components that prove each authoring workflow end-to-end.

| ID | Path | Proves |
|---|---|---|
| D1 | `pulse/SmokePulse.tsx` | Framer Motion + SVG + publish flow |
| D2 | `rotating-cube/RotatingCube.tsx` | R3F + drei + lazy-load |
| D3 | `model-viewer-demo/ModelViewerDemo.tsx` | `<model-viewer>` web component |
| D4 | `node-focus/useNodeFocusSpring.ts` | Canvas ↔ Framer Motion spring bridge |
| D5 | (app/smoke-route) | Next 16 `unstable_ViewTransition` wiring |
| D6 | `chart-reveal/ChartReveal.tsx` | Recharts + Framer Motion |
| D7 | `scroll-fade/ScrollFade.tsx` | GSAP ScrollTrigger lazy-load |
| D8 | `gsap-draw-morph/DrawMorph.tsx` | DrawSVG + MorphSVG plugin load |
| D10 | `lottie-demo/LottieDemo.tsx` | `lottie-react` playback |
| D11 | (manim scene) | Manim → .mp4 → publish |
| D12 | `_assets/glb/ethanol.glb` | SMILES → RDKit → pygltflib |
| D13 | wiki/index.md smoke ref | End-to-end [[anim:name]] |

See `content/graph/README.md` for the full authoring guide.
