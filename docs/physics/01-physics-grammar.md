# Physics Grammar

The connectome physics grammar is the contract between data and motion. It
defines what a visual movement is allowed to mean, where the signal comes from,
and how that signal should be implemented.

This is not literal astronomy. It is a semantic galaxy: the visual language
borrows stars, planets, moons, rings, dust, and orbital mechanics because those
forms are good at communicating hierarchy, locality, gravity, uncertainty, and
change.

## Design Rules

1. Motion must be explainable.
   A point can move because scope changed, evidence arrived, a query activated a
   neighborhood, a relation has weight, or an uncertainty field increased. It
   should not move only because animation looks pleasant.
2. Layout is memory, not proof.
   Distance and orbit communicate relative evidence and neighborhood structure,
   but exact scientific claims still live in panels, wiki pages, citations, and
   ranked result lists.
3. Physics variables must stay bounded.
   A clinical graph cannot let a single popular paper or high-degree entity
   collapse the scene. Every force needs caps, damping, and debug visibility.
4. Identity and attention are separate.
   A corpus-backed entity has stable identity. A prompt-discovered candidate can
   appear as provisional matter before it is resolved, attached, or discarded.
5. Rendering residency is not ontology.
   A point disappearing from the GPU does not mean it left the corpus. It only
   means it is outside the current resident render set.

## Galaxy Objects

| Object | Visual Role | Data Role | Physics Meaning |
| --- | --- | --- | --- |
| Wiki star | Central star or system barycenter | A wiki page, topic page, module, or durable concept surface | Stable place the user can return to; attracts its local evidence neighborhood |
| Entity planet | Planet, focused star, or orbiting body | Disease, drug, gene, pathway, symptom, outcome, method, organism, or clinical concept | Semantic identity with mass, type, and relation-specific gravity |
| Paper moon | Moon, satellite, belt body, or ring particle | Corpus paper, abstract, trial, guideline, review, preprint, note, or evidence item | Evidence unit; orbital distance reflects relation strength and relevance |
| Citation ring | Ring, arc, or belt around an entity/wiki star | Citation edges, shared references, co-citation, evidence families | Repeated structured evidence around the body |
| Evidence comet | Transient streak, pulse, or wake | RAG result, search hit, retrieved citation, new context | Active attention passing through the scene |
| Prompt protostar | Faint new body forming near a focus | Entity or claim detected in the prompt but not yet resident or resolved | Provisional identity that may resolve into corpus-backed matter |
| Dust field | Low-detail point field or shader-only atmosphere | Background corpus density, unresolved aggregate counts, nonresident regions | Context and scale, not individual evidence identity |
| Void | Empty or dimmed region | Out-of-scope, hidden, or unloaded graph space | Absence from the current task, not absence from corpus |

The same data object can change visual role by frame. An entity can orbit inside
a wiki system, then become the focused star when selected. That transition must
be animated as a reference-frame change, not a sudden ontology swap.

## Physics Variables

These names describe product semantics. Implementation may store them in packed
attributes, textures, DuckDB columns, or shader uniforms.

| Variable | Meaning | Likely Source | Render/Physics Effect |
| --- | --- | --- | --- |
| `position` | Current 3D spatial memory | Baked layout plus runtime forces | Point location, camera target, neighborhood continuity |
| `velocity` | Current movement vector | Runtime force integration | Smooth settling, wakes, orbit response |
| `mass` | Evidence/influence weight | Log-scaled citation count, paper references, entity frequency, evidence authority | Larger/steadier bodies move less and attract more, with strict caps |
| `radius` | Visual size | Mass, focus, type, confidence | Apparent size; should not equal raw degree |
| `gravity` | Data-grounded attraction | Focus relation, kNN edge, citation edge, entity-paper membership | Pulls related bodies toward a focus or barycenter |
| `cohesion` | Structural togetherness | Cluster membership, wiki module, active scope | Keeps a neighborhood legible without pretending all points are directly related |
| `repulsion` | Minimum separation | Resident density and collision-avoidance heuristic | Prevents visual collapse and overlap |
| `linkTension` | Spring strength | Edge weight, relation class, evidence score | Controls how tightly related bodies hold together |
| `damping` | Resistance to motion | Stability, reduced motion, energy decay | Settles the system and prevents jitter |
| `temperature` | Simulation energy | Search, focus, RAG, user interaction, timeline changes | Raises or lowers how strongly the system rearranges |
| `entropy` | Ambient disorder or uncertainty | Current UI control, uncertainty, exploratory mode | Adds bounded drift/noise; never rewrites identity |
| `orbitRadius` | Relation distance | Relation rank, evidence distance, hop count, membership strength | Determines local orbital shell around an entity/star |
| `angularVelocity` | Orbit speed | Recency, activity, evidence freshness, attention | Communicates activity; must be capped for readability |
| `eccentricity` | Non-circularity | Ambiguity, multi-cluster membership, conflicting signals | Makes uncertain bodies less settled |
| `inclination` | Orbital plane | Entity type, relation class, modality, source layer | Separates relation families without requiring color alone |
| `brightness` | Attention and salience | Focus, hover, search rank, RAG rank, evidence pulse | Glow, alpha, bloom, pulse intensity |
| `color` | Class or state | Entity type, evidence status, cluster, wiki module | Semantic grouping; should not carry too many channels |
| `ringDensity` | Related evidence count | Paper count, citation count, evidence family size | Ring thickness, belt population, aggregate hint |
| `stability` | Confidence and persistence | Resolved identity, evidence quality, repeated user attention | Provisional matter settles or fades based on stability |
| `scopeMask` | Logical inclusion | DuckDB active view, filter SQL, selected module | Controls participation in focus, alpha, and residency |
| `residentReason` | Why the point is drawn | Focus, pinned, search, wiki, sample, neighbor, aggregate | Debuggable residency and graceful fade-out priority |

## Existing Variable Mapping

| Current Implementation | Current Meaning | Future Physics Role |
| --- | --- | --- |
| `BLOB_POINT_COUNT = 16384` | Fixed field/orb particle count | Baseline identity pool, not corpus or dust maximum |
| `PARTICLE_STATE_TEXTURE_SIZE = 128` | 16,384 state slots | Initial state lane capacity |
| State texture R | Scope inclusion | `scopeMask` |
| State texture G | Focus/hover | `brightness`, attention, local gravity trigger |
| State texture B | Evidence/search pulse | `temperature`, `brightness`, `evidence comet` pulse |
| State texture A | Reserved | Candidate for `residentReason`, stability, or phase state |
| `motionSpeedMultiplier` | Ambient motion speed | User-facing temperature/speed control |
| `rotationSpeedMultiplier` | Scene rotation speed | Ambient camera/field rotation, not semantic orbit by itself |
| `ambientEntropy` | Shader drift amplitude | Bounded entropy lane |
| `pauseMotion` / reduced motion | Accessibility and hard pause | Damping/temperature floor contract |
| DuckDB `currentPointScopeSql` | Active point filter | Logical scope gate before visual physics |
| RAG result refs | Evidence pulse inputs | Transient comets, wakes, and prompt protostars |

## Force Families

### Stable Forces

Stable forces are always available when a point is resident.

- Cluster gravity: pulls a point toward its semantic cluster or wiki system.
- Link springs: preserve important local relationships.
- Repulsion: keeps dense areas readable.
- Damping: lets motion settle.
- Boundary pressure: keeps the active resident field inside navigable camera
  bounds.

### Event Forces

Event forces are activated by user or system events.

- Search pulse: ranked hits brighten, warm, and move toward the query focus.
- RAG pulse: retrieved evidence wakes its local neighborhood.
- Focus gravity: selected entity/wiki/paper temporarily becomes a stronger
  attractor.
- Scope contraction: unrelated resident points dim, lose force participation,
  then become eviction candidates.
- Prompt protostar formation: extracted entities appear as faint provisional
  bodies near the current text/query focus.

### Ambient Forces

Ambient forces make the galaxy breathe without changing data meaning.

- Very low-amplitude orbital drift.
- Slow whole-field rotation when no direct interaction is happening.
- Tiny shader-only noise for dust and background matter.
- Activity shimmer around recently used systems.

Ambient force must be visually subordinate to semantic force. It is allowed to
make the field feel alive; it is not allowed to invent relationships.

## Reference Frames

The same graph should support several reference frames:

| Frame | Center | Use Case | Physics Behavior |
| --- | --- | --- | --- |
| Corpus galaxy | Global manifold | Overview, orientation, landing | Low temperature, aggregate density, mostly baked layout |
| Wiki system | Wiki page/module | Reading and learning | Wiki star anchors local entity planets and paper rings |
| Entity system | Entity page/focus | Clinical concept exploration | Entity becomes barycenter; related papers/entities orbit by evidence strength |
| Paper system | Paper/evidence focus | Citation and evidence review | Paper anchors citations, entities, methods, outcomes |
| Prompt system | Active text/query | RAG/search/research session | Prompt entities become protostars; evidence comets resolve around them |

Changing frames should preserve identity through animated transforms and stable
labels/picking. The user should feel that the same universe is being reframed,
not that a separate visualization replaced it.

## Provisional Matter

Prompt/RAG workflows need bodies that are not yet in the resident base set.

Lifecycle:

1. Detect candidate entity, paper, claim, or relation from the prompt.
2. Render it as low-mass provisional matter near the active text/query focus.
3. Ask the API/DuckDB session for corpus matches, aliases, and local
   neighborhoods.
4. If resolved, morph the provisional body into the matched corpus identity and
   stream in its local neighborhood.
5. If unresolved, keep it as session matter with clear styling and lower
   stability, or fade it out when no longer relevant.

This is the bridge between retrieval-augmented writing and the galaxy. The
typing experience can visibly create gravitational questions before the corpus
answers them.

## What Ambient Dust Is For

Ambient dust is not useless if it is honest.

Useful dust:

- Shows scale and density without loading every identity.
- Gives the camera motion parallax and depth.
- Communicates that there is more corpus beyond the active resident set.
- Can encode aggregate counts by cluster, type, or topic.

Bad dust:

- Pretends to be individual papers/entities when it is only decoration.
- Consumes particle budget needed for interactive identity.
- Obscures labels, selection, or evidence pulses.

Rule: dust can be shader-only or aggregate-backed, but corpus-backed resident
particles should be reserved for things the user can inspect, select, or explain.

## Maximum Particle Framing

There is no single permanent maximum that describes the product. There are three
different limits:

| Limit | Meaning | Current/Target Framing |
| --- | --- | --- |
| Corpus size | Full available graph | Millions of points across bundles and backend storage |
| Resident set | Points loaded into the browser session for current work | Dynamic, budgeted by device and quality tier |
| Draw set | Points submitted to GPU this frame | Smaller than or equal to resident set; should be chunkable |

The current 16,384-particle orb should be treated as an identity baseline, not
a ceiling and not a dust budget. Reasonable engineering targets are:

- 16K: safe identity baseline and mobile/low-power tier.
- 25K-50K: plausible desktop resident identity tier with current WebGL-style
  discipline and careful attribute budgets.
- 100K: possible only with chunking, LOD, GPU-side state, careful picking, and
  measured browser/device gates.
- 1M: not a live individual-particle draw target for the interactive orb. It is
  a corpus/backend/bundle target, represented through streaming, aggregates,
  tiles, and focused resident neighborhoods.

The product should feel like access to a million-point galaxy because the
browser can stream, resolve, and reveal local systems smoothly, not because it
draws every point all the time.
