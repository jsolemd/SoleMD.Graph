# Philosophy Page Model Inspection

This file is a lightweight inventory for the model assets mirrored into the
philosophy archive.

## Local Model Inventory

- `models/Cubes.glb`
  - size: about `159 KB`
  - expected scene slug: `cubes`
- `models/Net.glb`
  - size: about `1.2 MB`
  - expected scene slug: `hex`
- `models/Shield.glb`
  - size: about `439 KB`
  - expected scene slug: `shield`
- `models/Users.glb`
  - size: about `270 KB`
  - expected scene slug: `users`
- `models/World.glb`
  - size: about `863 KB`
  - expected scene slug: `globe`

## How The Runtime Uses Models

- `scripts.pretty.js:4458`
  - `loadModel()` dispatches by extension and uses GLTF/OBJ/FBX loaders
- `scripts.pretty.js:4458`
  - `fromModel()` extracts geometry from a traversed scene
- `scripts.pretty.js:4458`
  - `fromVertices()` expands geometry vertices into particle positions with
    per-vertex randomness and count scaling

## Practical Read

- the philosophy page does not need all model scenes active at once
- instead, the route swaps among multiple model-backed slugs across the story
  cards
- the heaviest local model in this archive is `Net.glb`, so future parity work
  should treat that scene as one of the more expensive swaps
