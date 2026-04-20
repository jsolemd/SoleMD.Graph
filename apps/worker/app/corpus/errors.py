from __future__ import annotations


class CorpusError(RuntimeError):
    """Base error for the post-ingest corpus lane."""


class CorpusSelectionAlreadyPublished(CorpusError):
    """The requested release pair already has a published selection run."""


class CorpusSelectionAlreadyInProgress(CorpusError):
    """The requested release pair is already locked for selection."""


class CorpusWaveAlreadyPublished(CorpusError):
    """The requested wave plan already has a published dispatch run."""


class CorpusWaveAlreadyInProgress(CorpusError):
    """The requested wave plan is already locked for dispatch."""


class UpstreamReleaseMissing(CorpusError):
    """An expected upstream source release is missing."""


class UpstreamReleaseNotPublished(CorpusError):
    """An upstream source release exists but is not ready for corpus selection."""


class SelectorPlanDrift(CorpusError):
    """The persisted selection or wave plan no longer matches the validated request."""


class MissingCuratedAssets(CorpusError):
    """One or more curated corpus assets are missing from the repo."""


class UnsupportedWavePolicy(CorpusError):
    """The requested child-wave policy is not implemented."""


class SelectionRunNotPublished(CorpusError):
    """No published corpus selection exists for the requested release pair."""
