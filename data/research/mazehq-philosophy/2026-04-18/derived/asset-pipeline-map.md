# Philosophy Page Asset Pipeline Map

Use this file when you need to know which asset family likely powers each
visible scene.

## Asset Families

- procedural point clouds
  - `sphere`
  - likely generated without a `.glb` source
- bitmap-derived point clouds
  - `pcb`
  - built from `pcb.png`
- model-derived point clouds
  - `cubes`
  - `hex`
  - `shield`
  - `users`
  - `globe`

## Shared Graphics Assets

- `particle.png`
  - point sprite texture sampled by the fragment shader
- `pcb.png`
  - bitmap source for the PCB scene family
- `dotted-circle.svg`
  - hotspot ring art
- `dotted-circle-red.svg`
  - red hotspot ring art

## Model Candidates

These mappings are the most likely based on asset inventory plus scene slugs:

- `models/Cubes.glb`
  - likely backs `cubes`
- `models/Shield.glb`
  - likely backs `shield`
- `models/Users.glb`
  - likely backs `users`
- `models/World.glb`
  - likely backs `globe`
- `models/Net.glb`
  - likely backs `hex`

These last two are inference from naming rather than an explicit authored map.

## Typography And Brand Assets

- `fonts/Roobert/*`
  - primary interface family
- `fonts/HelveticaNeue/*`
  - body/supporting copy
- `fonts/PPSupplySans/*`
  - action/progress accent family
- `logotypes/`
  - investor and customer/logo strip assets in multiple density and breakpoint
    variants

## Non-Critical But Useful Extras

- `logo.png`
  - mirrored because it is present in the theme image set
- `og_image.jpg`
  - site sharing asset, not part of the particle runtime
- `favicons/*`
  - shell completeness only, not animation-critical
