import { Text } from "@mantine/core";
import {
  sectionLabelStyle,
  panelTextStyle,
} from "@/features/graph/components/panels/PanelShell";
import type { WikiPageSummary } from "@solemd/api-client/shared/wiki-types";

interface WikiBacklinksProps {
  backlinks: WikiPageSummary[];
  onNavigate: (slug: string) => void;
}

export function WikiBacklinks({ backlinks, onNavigate }: WikiBacklinksProps) {
  if (backlinks.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 pt-2">
      <Text component="span" style={sectionLabelStyle}>
        Backlinks
      </Text>
      <div className="flex flex-col gap-0.5">
        {backlinks.map((link) => (
          <button
            key={link.slug}
            type="button"
            className="wiki-link text-left"
            style={panelTextStyle}
            onClick={() => onNavigate(link.slug)}
          >
            {link.title}
          </button>
        ))}
      </div>
    </div>
  );
}
