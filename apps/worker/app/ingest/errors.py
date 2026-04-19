from __future__ import annotations


class IngestError(RuntimeError):
    pass


class IngestAlreadyPublished(IngestError):
    pass


class IngestAlreadyInProgress(IngestError):
    pass


class PlanDrift(IngestError):
    pass


class SourceSchemaDrift(IngestError):
    pass


class IngestAborted(IngestError):
    pass
