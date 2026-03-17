# Ask Mode — LLM Grounded in the Graph

> The LLM doesn't hallucinate. It navigates.

## Overview

Ask is the **default mode**. The prompt box is a standard chat bar with conversation history above it. The graph shrinks to ~40% of the viewport and becomes **reactive** — it responds to the conversation in real-time, highlighting the nodes and edges the LLM traversed to construct its answer.

## Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SoleMD                                                          [Sign in] │
│                                                                             │
│  ┌──── GRAPH (responds to conversation) ────────────────────────────────┐   │
│  │                                                                      │   │
│  │     (Smith24)──MENTIONS──▶(BDNF)◀──MENTIONS──(Lee23)                │   │
│  │         |                  |  \                 |                    │   │
│  │       CITES            LINKED  RELATES        CITES                 │   │
│  │         |                |       \              |                    │   │
│  │     (Park22)          (Term)    (TRD)◀─────(Wang24)                 │   │
│  │                                   |                                  │   │
│  │           ★ HIGHLIGHTED = traversed by LLM to answer ★              │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌── Conversation ──────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  You: What do we know about BDNF in treatment-resistant depression?  │   │
│  │                                                                      │   │
│  │  SoleMD: Based on 4 papers in your graph:                            │   │
│  │                                                                      │   │
│  │  BDNF levels are consistently reduced in TRD patients compared       │   │
│  │  to treatment-responsive MDD [Smith 2024]¹. Ketamine's rapid         │   │
│  │  antidepressant effect appears mediated through BDNF-TrkB            │   │
│  │  signaling in the prefrontal cortex [Lee 2023]².                     │   │
│  │                                                                      │   │
│  │  ¹ ← click: opens Smith2024 paper node                              │   │
│  │  ² ← click: opens Lee2023, scrolls to evidence chunk                │   │
│  │                                                                      │   │
│  │  Entities: [BDNF] [TrkB] [ketamine] [PFC]  ← hover = graph glow    │   │
│  │  ──────────────────────────────────────────                          │   │
│  │  Traversal: 4 papers, 12 chunks, 3 relations, 2 terms               │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Follow up...                                                        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Behaviors

- **Graph shrinks to ~40%**, reactive to conversation context
- **Chat history** opens above the prompt box
- **Every claim is backed by a node** — citations are clickable and zoom the graph
- **Entity highlighting** in responses — underlined, interactive entities
- **Conversation fingerprint** — entities mentioned across the Q&A session stay lit in the graph, forming an expanding conceptual territory

## LLM ↔ Graph Pipeline

```
User:  "What do we know about BDNF in treatment-resistant depression?"

Pipeline:
  1. LLM parses intent → entity extraction: [BDNF, TRD]
  2. Graph query: find paths between BDNF and TRD nodes
  3. Retrieve chunks along those paths (RAG)
  4. LLM synthesizes answer from chunks
  5. WHILE answering:
     - cosmograph.selectNodes(traversedNodes)     ← nodes light up
     - cosmograph.zoomToNode(centralNode)          ← camera moves
     - nodeColor accessor dims non-traversed       ← context fades
  6. Answer includes clickable citations:
     "[Smith 2024]¹" → click → cosmograph.zoomToNode(smithNode)
```

## Entity Highlighting

Every recognized entity in the LLM's response is underlined and interactive:

- **Hover** an entity in the chat → its node glows in the graph above
- **Click** an entity → the graph zooms to its neighborhood
- Entities mentioned across the conversation **stay lit** — the conceptual fingerprint grows with each follow-up question

```
IN THE CHAT (Ask mode):

  SoleMD: "BDNF levels are reduced in TRD patients [Smith 2024]¹"
               │                    │
               │ hover/click        │ hover/click
               ▼                    ▼
          Entity node lights    Entity node lights
          up in the graph       up in the graph
```

## Prompt Box Shape

Standard chat bar. Mode toggles visible. Input placeholder: "Ask anything about your knowledge graph..."

```
╭──────────────────────────────────────────────────────────────╮
│  ●Ask  ○Explore  ○Write                                      │
│  Follow up...                                            ⏎   │
╰──────────────────────────────────────────────────────────────╯
```

## Phasing

| Phase | Feature |
|-------|---------|
| MVP | Basic LLM chat with graph traversal highlighting |
| Phase 2 | Entity highlighting in responses, conversation fingerprint |
| Phase 3 | Evidence synthesis — multi-paper answers with conflict detection |
