interface CitationFootnoteProps {
  id: string;
  index: number;
}

export function CitationFootnote({ id, index }: CitationFootnoteProps) {
  return (
    <sup>
      <a
        href={`#citation-${id}`}
        className="no-underline hover:underline"
        style={{ color: "var(--module-accent)", fontSize: "0.75em" }}
      >
        [{index}]
      </a>
    </sup>
  );
}
