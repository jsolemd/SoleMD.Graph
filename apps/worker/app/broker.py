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


def create_broker(worker_settings: Settings | None = None) -> dramatiq.Broker:
    runtime_settings = worker_settings or settings
    broker = RedisBroker(
        url=runtime_settings.redis_url,
        namespace=runtime_settings.worker_redis_namespace,
    )
    ensure_middleware(broker, AsyncIO())
    ensure_middleware(
        broker,
        Retries(max_retries=3, min_backoff=1_000, max_backoff=60_000),
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
