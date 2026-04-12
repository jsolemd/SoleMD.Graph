1. Wiki page 
- profile animation overhaul:
    - ChemicalProfile → 7 pages (receptor bars + disease indication pills)
    - DiseaseProfile → 5 pages (evidence scale bars + chemical/molecular target pills)
    - GeneReceptorProfile → 4 pages (ligand bars + disease association pills)
    - AnatomyProfile → 4 pages (disorder + pathway pills)
    - NetworkProfile → 3+1 pages (component entities grouped by type)
- wiki pipeline optimization so that it's actually leveraging all the metadata and RAG content from all the papers. 
2. RAG
    - full overhaul - agentic RAG + deterministic improval @rag-handoff.md
        1. Add dense child ANN retrieval.
            - lexical child retrieval stays
            - dense child retrieval is added in parallel
            - keep rescue lanes bounded
        2. Replace loose phrase rescue with a small `ConceptPackage`.
            - preserve exposure, phenotype, temporality, polarity, dose, article-type intent, and canonical ids
            - feed those slots into retrieval and ranking instead of flattening them away
        3. Add a bounded agentic retrieval controller for weak first-pass cases.
            - let the LLM infer intent and follow-up retrieval moves only when shortlist quality is weak
            - keep the follow-up budget small
            - require ontology grounding and lexical safeguards on the follow-up moves
        4. Re-anchor paper ranking on child evidence.
            - child-first aggregation
            - stronger parent-child promotion
            - review overbreadth penalty where direct child evidence exists elsewhere
        5. Train or tune with citation-aware hard negatives.
            - citation neighbors
            - semantic neighbors
            - same-concept wrong-phenotype papers
            - overly broad review articles that currently steal rank
        6. Expand reranking carefully.
            - broader bounded MedCPT reranking first
            - late-interaction reranking later, if the candidate set improves enough to justify it
        7. Keep graph support offline and precomputed.
            - graph priors, candidate expansion, rerank support
            - no default live graph traversal
3. Links, authors, geographic metadata on map deck.gl or whatever
4. Modules /modules
    - Complete overhaul of AI for MD - reusable modular items that use react/hooks properly with visx and d3 and framer motions animations. 
    - ensure it's also being built off RAG content with inline citations that link to the appers in comsograph. 
    - wiki for individual papers? probably not more likely use selection tool and keep that comsograph native with fast API 
        TOOLS:
        1. Framer Motion v12 - UI animation (reveals, transitions, springs, stagger)
        2. GSAP 3 - Scroll-pinned demos, SVG morph/draw, text splitting
        3. visx - Headless SVG chart primitives (composes with Framer Motion)
        4. SVG + Framer Motion - Custom animated diagrams (motion.path, motion.rect)
        5. React Three Fiber + drei - Interactive 3D scenes
        6. @google/model-viewer - Simple 3D model display
        7. lottie-react - Pre-made Lottie animations
        8. Manim CE - Math/science video renders
        9. Magic UI / Aceternity UI - Copy-paste animated components
        10. Noto Emoji / BioIcons / Lucide - SVG icons and illustrations

