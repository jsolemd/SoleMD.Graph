# PubTator Bulk Dataset Audit

Status: Release-aware storage complete; BioCXML structure audit pending  
Scope: tabular annotation files + BioCXML release packaging on `E:`

## Why This Exists

Semantic Scholar is now on a release-aware storage layout. PubTator needs the
same treatment so monthly refreshes are reproducible and the richer BioCXML
payload can be audited before later document/RAG work.

## Current State

- PubTator tabular files are downloaded and already loaded into PostgreSQL:
  - `bioconcepts2pubtator3.gz`
  - `relation2pubtator3.gz`
- PubTator BioCXML archives are downloaded for release `2026-03-21`.
- Release-aware storage is now complete:
  - `pubtator/releases/2026-03-21/` contains the canonical tabular files + BioCXML
  - release manifests exist for:
    - `annotations`
    - `biocxml`
  - active `data/pubtator/raw` now points to the release directory
- A preserved backup of the old mixed raw tree exists at:
  - `pubtator/raw_pre_release_cutover_2026-03-21`
- Initial BioCXML probe confirms the richer document surface we expected:
  - one XML document per article inside the tar archives
  - document-level PubMed / PMC / DOI / publisher identifiers
  - passage-level offsets and section labels such as `TITLE`, `ABSTRACT`,
    `INTRO`, and `METHODS`
  - front-matter metadata inline in `<infon>` tags:
    - author name fragments
    - volume / issue / pagination / elocation-id
    - license text
    - keyword text
  - inline `<annotation>` tags with exact offsets and entity types
  - sample file inspected:
    - archive member: `output/BioCXML/10.BioC.XML`
    - document id: `40808120`
    - passage count: `148`
    - annotation types seen: `Chemical`, `Disease`, `Species`, `CellLine`
  - relation tags are present, but not uniformly:
    - in a 10-document sample from `BioCXML.0.tar.gz`, the first 3 documents had
      `0` relation tags
    - later sampled documents in the same archive had anywhere from `6` to
      `1,565` relation tags
    - this suggests BioCXML relation density varies sharply by article and should
      be treated as a richer later-layer substrate, not assumed uniform document
      metadata

## Pending Tasks

1. Audit BioCXML structure:
   - relation-tag distribution across a broader sample
   - section-label distribution across a broader sample
   - whether author/license/front-matter fields are consistent enough to rely on
   - how much additional text/context this gives us beyond the tabular PubTator load
2. Decide which PubTator fields remain tabular-only for graph work vs which are
   reserved for later document/RAG work.

## Intended Outcome

- PubTator storage becomes release-aware like Semantic Scholar.
- Monthly refreshes become safe and reproducible.
- BioCXML is available for later richer mention/document context and full-text
  workflows, but it does not block the first mapped graph.
