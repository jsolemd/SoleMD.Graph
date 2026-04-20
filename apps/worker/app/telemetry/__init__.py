from __future__ import annotations

# Intentionally empty.
#
# Importing a package submodule such as `app.telemetry.bootstrap` executes this
# package initializer first. Keeping it side-effect free ensures the bootstrap
# helper can establish Prometheus multiprocess environment variables before
# `app.telemetry.metrics` imports `prometheus_client`.
