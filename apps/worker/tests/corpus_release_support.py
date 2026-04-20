from __future__ import annotations

from pathlib import Path

from helpers import write_jsonl_gz, write_manifest, write_tsv_gz


async def write_sample_s2_release(root: Path, *, release_tag: str) -> None:
    release_dir = root / "releases" / release_tag
    publication_venues_dir = release_dir / "publication-venues"
    authors_dir = release_dir / "authors"
    papers_dir = release_dir / "papers"
    abstracts_dir = release_dir / "abstracts"
    citations_dir = release_dir / "citations"

    venues_path = publication_venues_dir / "publication-venues-0000.jsonl.gz"
    authors_path = authors_dir / "authors-0000.jsonl.gz"
    papers_path = papers_dir / "papers-0000.jsonl.gz"
    abstracts_path = abstracts_dir / "abstracts-0000.jsonl.gz"
    citations_path = citations_dir / "citations-0000.jsonl.gz"

    write_jsonl_gz(
        venues_path,
        [
            {"id": "venue-1", "issn": "1234-5678", "name": "Journal of Affective Disorders"},
            {"id": "venue-2", "issn": "2222-3333", "name": "Frontiers in Neuropharmacology"},
        ],
    )
    write_jsonl_gz(
        authors_path,
        [
            {
                "authorid": "author-1",
                "name": "Ada Ingest",
                "externalids": {"ORCID": "0000-0000-0000-0001"},
            }
        ],
    )
    write_jsonl_gz(
        papers_path,
        [
            {
                "corpusid": 101,
                "title": "Amyloid beta in depression",
                "venue": "Journal of Affective Disorders",
                "year": 2026,
                "publicationdate": "2026-05-01",
                "isopenaccess": True,
                "publicationvenueid": "venue-1",
                "externalids": {"PubMed": "60101", "DOI": "10.1000/p101"},
                "authors": [{"authorId": "author-1", "name": "Ada Ingest"}],
            },
            {
                "corpusid": 102,
                "title": "Novel neuropharmacology survey",
                "venue": "Frontiers in Neuropharmacology",
                "year": 2026,
                "publicationdate": "2026-05-01",
                "isopenaccess": False,
                "publicationvenueid": "venue-2",
                "externalids": {"PubMed": "60102", "DOI": "10.1000/p102"},
                "authors": [{"authorId": "author-1", "name": "Ada Ingest"}],
            },
        ],
    )
    write_jsonl_gz(
        abstracts_path,
        [
            {"corpusid": 101, "abstract": "Amyloid beta abstract."},
            {"corpusid": 102, "abstract": "Neuropharmacology abstract."},
        ],
    )
    write_jsonl_gz(
        citations_path,
        [
            {
                "citationid": 1,
                "citingcorpusid": 101,
                "citedcorpusid": 102,
                "isinfluential": True,
                "intents": ["background"],
            }
        ],
    )

    write_manifest(
        release_dir / "manifests" / "publication-venues.manifest.json",
        dataset="publication-venues",
        release_tag=release_tag,
        output_dir=publication_venues_dir,
        file_names=[venues_path.name],
    )
    write_manifest(
        release_dir / "manifests" / "authors.manifest.json",
        dataset="authors",
        release_tag=release_tag,
        output_dir=authors_dir,
        file_names=[authors_path.name],
    )
    write_manifest(
        release_dir / "manifests" / "papers.manifest.json",
        dataset="papers",
        release_tag=release_tag,
        output_dir=papers_dir,
        file_names=[papers_path.name],
    )
    write_manifest(
        release_dir / "manifests" / "abstracts.manifest.json",
        dataset="abstracts",
        release_tag=release_tag,
        output_dir=abstracts_dir,
        file_names=[abstracts_path.name],
    )
    write_manifest(
        release_dir / "manifests" / "citations.manifest.json",
        dataset="citations",
        release_tag=release_tag,
        output_dir=citations_dir,
        file_names=[citations_path.name],
    )


async def write_sample_pt3_release(root: Path, *, release_tag: str) -> None:
    release_dir = root / "releases" / release_tag
    bioconcepts_path = release_dir / "bioconcepts2pubtator3.gz"
    write_tsv_gz(
        bioconcepts_path,
        [
            "60101\tDisease\tC0078939\tamyloid beta\tAmyloid beta",
        ],
    )
    write_manifest(
        release_dir / "manifests" / "bioconcepts2pubtator3.gz.manifest.json",
        dataset="bioconcepts2pubtator3.gz",
        release_tag=release_tag,
        output_dir=release_dir,
        file_names=[bioconcepts_path.name],
    )
