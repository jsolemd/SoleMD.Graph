from __future__ import annotations

import dramatiq
from dramatiq.brokers.redis import RedisBroker
from dramatiq.middleware import AsyncIO, Retries, ShutdownNotifications, TimeLimit

from app.config import Settings, settings


_broker: dramatiq.Broker | None = None


def ensure_middleware(
    broker: dramatiq.Broker, middleware: dramatiq.Middleware
) -> None:
    if any(type(existing) is type(middleware) for existing in broker.middleware):
        return
    broker.add_middleware(middleware)


def configure_retries(
    broker: dramatiq.Broker,
    *,
    max_retries: int,
    min_backoff: int,
    max_backoff: int,
) -> None:
    for middleware in broker.middleware:
        if isinstance(middleware, Retries):
            middleware.max_retries = max_retries
            middleware.min_backoff = min_backoff
            middleware.max_backoff = max_backoff
            return
    broker.add_middleware(
        Retries(
            max_retries=max_retries,
            min_backoff=min_backoff,
            max_backoff=max_backoff,
        )
    )


def create_broker(worker_settings: Settings | None = None) -> dramatiq.Broker:
    runtime_settings = worker_settings or settings
    broker = RedisBroker(
        url=runtime_settings.redis_url,
        namespace=runtime_settings.worker_redis_namespace,
    )
    ensure_middleware(broker, AsyncIO())
    configure_retries(
        broker,
        max_retries=3,
        min_backoff=1_000,
        max_backoff=60_000,
    )
    ensure_middleware(broker, TimeLimit())
    ensure_middleware(broker, ShutdownNotifications())
    return broker


def configure_broker(worker_settings: Settings | None = None) -> dramatiq.Broker:
    global _broker
    if _broker is None:
        _broker = create_broker(worker_settings)
        dramatiq.set_broker(_broker)
    return _broker
