# Prompts Reference (Langfuse v4)

> Status: pending backend rebuild. No Langfuse code lives in `apps/` today. Paths
> below track `docs/rag/15-repo-structure.md §7.3` (intended `apps/worker/app/...`).
> Examples will not execute on `main` until the worker-plane Langfuse adapter
> lands.

## Why Prompt Management

Prompts move on a different cadence than code. Storing them in Langfuse means:

- Non-engineers can edit and version prompts via the UI.
- The runtime fetches the **production-labeled** version, not whatever was
  hardcoded at deploy time.
- Every trace links back to the exact prompt version that produced it, which is
  the only way to debug a regression that ships through prompt edits.

## Fetching a Prompt

```python
from langfuse import get_client

langfuse = get_client()

# Latest production label (the v4 default)
prompt = langfuse.get_prompt(name="rag-evidence-answer")

# A specific version, regardless of label
prompt = langfuse.get_prompt(name="rag-evidence-answer", version=12)

# A specific label (staging, latest, or any custom label)
prompt = langfuse.get_prompt(name="rag-evidence-answer", label="staging")

# A chat-typed prompt (returns a list of messages, not a string)
prompt = langfuse.get_prompt(name="rag-evidence-answer-system", type="chat")
```

`get_prompt` is **cache-on-fetch**. Subsequent calls with the same args return
the cached prompt without a network roundtrip until the cache TTL expires.
Defaults and overrides:

- `cache_ttl_seconds` defaults to `60`. The cache lives in `langfuse._utils.prompt_cache`.
- Pass `cache_ttl_seconds=0` to disable caching for a specific fetch
  (use this for prompts you are actively editing in the UI).
- There is no built-in stale-while-revalidate. Either keep the default TTL
  and accept up to 60 s of staleness, or implement SWR yourself by wrapping
  `get_prompt` with a background refresh thread.

```python
# Hot prompt — disable cache while iterating
prompt = langfuse.get_prompt(name="rag-faithfulness-judge", cache_ttl_seconds=0)
```

## Compiling Variables

Prompts use `{{variable}}` placeholder syntax. Compile via `prompt.compile`:

```python
prompt = langfuse.get_prompt(name="rag-faithfulness-judge")
filled = prompt.compile(
    question="What is the mechanism of ketamine in TRD?",
    context=context_string,
    claims=json.dumps(claim_list),
)
# filled is a string (text prompt) or list[dict] (chat prompt)
```

Missing variables raise an error rather than silently leaving placeholders.

## Linking Prompts to Generations

Always pass the prompt to the generation observation so the UI can join traces
to prompt versions. This is the link that makes prompt regressions debuggable.

```python
with langfuse.start_as_current_observation(
    name="rag.evidence_answer",
    as_type="generation",
    model="gemini-2.5-flash",
    prompt=prompt,  # links the version to this generation
) as gen:
    response = call_model(filled)
    gen.update(input=filled, output=response)
```

## Creating and Updating Prompts

```python
langfuse.create_prompt(
    name="rag-evidence-answer",
    type="text",  # or "chat"
    prompt="Given the question {{question}} and context {{context}} ...",
    labels=["production"],  # which labels to attach to this version
    config={"temperature": 0.0, "max_output_tokens": 1024},
    tags=["rag", "answer-generation"],
)
```

`type` is **immutable** for a given prompt name. If you need to switch from
`text` to `chat`, create a new name (`rag-evidence-answer-chat`) and migrate
callers.

`config` is opaque to Langfuse — it travels with the prompt and is the
canonical place to keep model defaults that should move with the prompt
version.

Each `create_prompt` call creates a new version. Existing versions are never
mutated.

## Label Conventions

| Label | Mutability | Meaning |
|---|---|---|
| `production` | Movable, but treat as immutable in CI | What the runtime fetches by default. |
| `staging` | Movable | What the staging environment fetches. |
| `latest` | Auto-managed | Always points to the most recently created version. |
| `experiment-<name>` | Movable | Pin a specific experiment to a specific version. |

The skill rule is: only **promote** to `production` after a benchmark run on a
release-blocking suite confirms the new version does not regress. Never edit
production live unless the change is reverting to a previous version.

## Deferred-Fetch Fallback

When the runtime cannot reach Langfuse on cold start (network glitch, key
rotation), fall back to the last-known-good prompt cache rather than failing
the request. The cache is in-memory, so persist a hashed copy to disk if cold
starts must remain functional.

```python
def get_prompt_with_fallback(name: str, *, fallback: str) -> str:
    try:
        prompt = langfuse.get_prompt(name=name)
        return prompt.prompt
    except Exception as exc:  # log, do not raise
        logger.warning("langfuse_prompt_fetch_failed", name=name, error=str(exc))
        return fallback
```

This is acceptable for runtime hot paths only. CI and benchmarks must always
fail loud on a fetch error so a missing prompt is caught before deploy.

## SoleMD.Graph Prompt Catalog

These are the prompts the worker-plane runtime is expected to fetch
(post-rebuild, names track the historical contract):

| Name | Purpose | Type | Default label |
|---|---|---|---|
| `rag-evidence-answer` | Extractive evidence answer generation | text | production |
| `rag-evidence-answer-system` | System prompt for evidence answer | chat | production |
| `rag-grounded-evidence-answer` | Grounded answer generation | text | production |
| `rag-grounded-evidence-answer-system` | System prompt for grounded answer | chat | production |
| `rag-faithfulness-judge` | Faithfulness LLM judge template | text | production |
| `rag-context-relevance-judge` | Context relevance LLM judge template | text | production |
| `rag-answer-completeness-judge` | Answer completeness LLM judge template | text | production |
| `rag-verification` | Answer verification template | text | production |

Adding a new prompt requires:

1. Create the prompt in Langfuse with the `production` label held back until
   the first benchmark run validates it.
2. Add the name to the catalog above.
3. Reference it from the consuming module via
   `langfuse.get_prompt(name="...")` — never inline the text.

## Cross-References

- Linking prompts into generation observations:
  [`experiment-runner.md`](experiment-runner.md)
- Faithfulness, context-relevance, and answer-completeness judges that consume
  these prompts: [`rag-metrics.md`](rag-metrics.md)
