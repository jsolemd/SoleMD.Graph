 The clean model should be:

  - Plain text entities: any recognized entity in our universe/catalog, not just a small prompt-local list.
  - @: an explicit paper/reference action, only if we actually want inline citations in the editor.
  - Hover/wiki/graph overlay: separate read/projection behaviors layered on top of entities or references.

  So the right separation is:

  1. Entity layer

  - As you type normal prose like schizophrenia, dopamine, microglia, etc., we detect recognized entities from our universe.
  - Those get transient highlights.
  - Hover shows definition/wiki-style detail, aliases, counts, and graph actions.
  - Clicking an action can project related papers/nodes into the graph overlay.

  2. Reference layer

  - @ should not mean “entity”.
  - @ only makes sense if we want an explicit inline citation/reference affordance in create/manuscript mode.
  - If we keep it, it should search for supporting papers relevant to the surrounding sentence and insert a persistent paper reference.
  - If that interaction is not actually useful, we should not force it.

  3. Projection layer

  - Entities and references both feed graph actions.
  - Hover itself is read-only.
  - Explicit actions like “show related papers” or “show neighborhood” mutate the overlay.

  So I think the adjustment is:

  - Entity highlighting is the primary next feature.
  - @ is optional and should be justified as an inline citation workflow, not as a substitute for entity recognition.
  - The graph/wiki/overlay runtime should support both, but they should stay distinct.

  My current implementation only matches part of that vision:

  - I added the structural foundation for entity highlighting, but not the live entity detection/runtime yet.
  - I also started a paper-reference @ path, based on the assumption that inline supporting references were desired.

  If you want the cleaner priority, I should pivot immediately to:

  1. wire live entity recognition/highlighting for any entity in our universe
  2. add hover/wiki cards and graph actions for those entities
  3. decide afterward whether @ should stay as inline supporting-paper citation or be redesigned
