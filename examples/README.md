# examples/

Reference implementations of patterns that were built, worked, and then removed from the live code path.

## What lives here

- UI patterns that shipped and were reverted, kept as a starting point if we want to bring them back.
- Spikes that proved a technique was viable but aren't in active use.
- Hooks or components extracted from a feature that got simplified — preserved as a blueprint, not a dependency.

## What does not live here

- Work-in-progress for upcoming features (use a branch).
- Dead code that was never wired up (delete it; git keeps it).
- Bug-reproduction scratchpads (use a scratch branch or gist).

## Rules

- **Not built.** `examples/` is excluded from `tsconfig`, `eslint`, and `jest`. Nothing in `app/` or `features/` may import from here. These files do not need to keep compiling as the rest of the codebase evolves.
- **Self-contained per folder.** Each subfolder is one idea. It carries its own README explaining what it was, why it was removed, and what to do if you want to re-enable it.
- **Reference commit.** The README pins the commit SHA where the pattern last worked end-to-end, so you can `git show <sha>:<path>` for context that isn't in the snapshot.
- **No imports from live code.** Snapshots copy any helper they need or reference it by path in prose. This keeps the snapshot stable when the live helper is renamed or removed.

## Index

- [`prompt-drag/`](./prompt-drag/README.md) — draggable prompt box with a responsive bottom grab/recenter bar.
