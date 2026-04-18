## Scripts

Reserved for operator and developer scripts that are not deployable apps and do
not belong in `infra/`.

- `graph-stack` — frontend-only tmux supervisor for the current clean-room
  checkout. Backend runtime management belongs here once `apps/api` and
  `apps/worker` gain real local startup contracts.
