import type { PaperCitationProps } from "@/features/wiki/lib/markdown-pipeline";

/**
 * Inline PMID citation badge.
 * When a graph paper ref is available, clicking focuses the paper on the graph.
 * Otherwise, links to PubMed.
 */
export function PaperCitation({
  pmid,
  graphPaperRef,
  children,
  onPaperClick,
}: PaperCitationProps) {
  const hasGraphRef = graphPaperRef != null && onPaperClick != null;

  if (hasGraphRef) {
    return (
      <button
        type="button"
        className="wiki-citation wiki-citation--linked"
        onClick={() => onPaperClick(graphPaperRef)}
        title={`PMID ${pmid} — click to focus on graph`}
      >
        {children}
      </button>
    );
  }

  return (
    <a
      className="wiki-citation"
      href={`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`}
      target="_blank"
      rel="noopener noreferrer"
      title={`PMID ${pmid} — open in PubMed`}
    >
      {children}
    </a>
  );
}
