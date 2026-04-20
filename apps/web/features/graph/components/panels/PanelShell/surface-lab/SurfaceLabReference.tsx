"use client";

import { Badge, Group, Table, Text } from "@mantine/core";
import {
  badgeAccentStyles,
  badgeOutlineStyles,
  MetaPill,
  panelAccentCardClassName,
  panelAccentCardStyle,
  panelCardClassName,
  panelCardStyle,
  panelMonoLabelStyle,
  panelPillStyles,
  panelSurfaceStyle,
  panelTextDimStyle,
  panelTextStyle,
} from "@/features/graph/components/panels/PanelShell";
import {
  type SurfaceInventoryRow,
  laterConsiderationItems,
  tokenWallGroups,
} from "./surface-lab-data";

function InventoryStatusBadge({ status }: { status: "Canonical" | "Live" | "Style Contract" }) {
  if (status === "Canonical") {
    return (
      <Badge size="xs" variant="light" styles={badgeAccentStyles}>
        {status}
      </Badge>
    );
  }

  if (status === "Style Contract") {
    return (
      <Badge size="xs" variant="outline" styles={badgeOutlineStyles}>
        {status}
      </Badge>
    );
  }

  return (
    <Badge size="xs" styles={panelPillStyles}>
      {status}
    </Badge>
  );
}

export function TokenSwatch({
  label,
  token,
  value,
}: {
  label: string;
  token: string;
  value: string;
}) {
  return (
    <div className="rounded-xl p-3" style={panelCardStyle}>
      <div
        className="h-12 rounded-lg"
        style={{ background: value }}
      />
      <Text mt={10} fw={600} style={panelTextStyle}>
        {label}
      </Text>
      <Text mt={2} style={panelMonoLabelStyle}>
        {token}
      </Text>
    </div>
  );
}

function TokenWallChip({
  label,
  token,
}: {
  label: string;
  token: string;
}) {
  return (
    <div className="rounded-xl p-3" style={panelCardStyle}>
      <div
        className="h-10 rounded-lg"
        style={{ background: `var(${token})` }}
      />
      <Text mt={8} fw={600} style={panelTextStyle}>
        {label}
      </Text>
      <Text mt={2} style={panelMonoLabelStyle}>
        {token}
      </Text>
    </div>
  );
}

function BrandReadSummary() {
  return (
    <div className="grid gap-3 xl:grid-cols-3">
      <div className={panelAccentCardClassName} style={panelAccentCardStyle}>
        <Text fw={600} style={panelTextStyle}>
          Brand Face
        </Text>
        <Text mt={4} style={panelTextStyle}>
          The site brand is mostly carried by the core pastels plus the neutral foundations. These are the colors people consciously remember.
        </Text>
      </div>
      <div className={panelCardClassName} style={panelCardStyle}>
        <Text fw={600} style={panelTextStyle}>
          Semantic Colors
        </Text>
        <Text mt={4} style={panelTextDimStyle}>
          Disease, chemical, gene, anatomy, physiology, and module hues exist so the graph can encode meaning. They are not all separate brand colors.
        </Text>
      </div>
      <div className={panelCardClassName} style={panelCardStyle}>
        <Text fw={600} style={panelTextStyle}>
          System Tokens
        </Text>
        <Text mt={4} style={panelTextDimStyle}>
          Panel, prompt, overlay, feedback, and control tokens are mechanical variables. There are many names because they manage behavior, not because the brand needs many visible hues.
        </Text>
      </div>
    </div>
  );
}

export function AdoptionInventory({ rows }: { rows: SurfaceInventoryRow[] }) {
  return (
    <div className="space-y-4">
      <div className={panelCardClassName} style={panelCardStyle}>
        <Text fw={600} style={panelTextStyle}>
          Audit Read
        </Text>
        <Text mt={4} style={panelTextDimStyle}>
          This table is source-derived from current code usage. It shows which items are real semantic shells versus style contracts, and where updates will auto-propagate.
        </Text>
      </div>

      <Table.ScrollContainer minWidth={1040}>
        <Table
          styles={{
            table: {
              ...panelSurfaceStyle,
              overflow: "hidden",
            },
            th: {
              backgroundColor: "var(--graph-panel-bg)",
              borderColor: "transparent",
              color: "var(--graph-panel-text-dim)",
              fontSize: 11,
              fontWeight: 600,
              textTransform: "none",
            },
            td: {
              verticalAlign: "top",
              borderColor: "transparent",
            },
          }}
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Primitive</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Live adopters</Table.Th>
              <Table.Th>Auto-propagation</Table.Th>
              <Table.Th>Notes</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.primitive}>
                <Table.Td>
                  <Text fw={600} style={panelTextStyle}>
                    {row.primitive}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text style={panelTextDimStyle}>{row.role}</Text>
                </Table.Td>
                <Table.Td>
                  <InventoryStatusBadge status={row.status} />
                </Table.Td>
                <Table.Td>
                  {row.adopters.length > 0 ? (
                    <Group gap={6}>
                      {row.adopters.map((adopter) => (
                        <MetaPill key={`${row.primitive}:${adopter}`} title={adopter}>
                          {adopter}
                        </MetaPill>
                      ))}
                    </Group>
                  ) : (
                    <Text style={panelTextDimStyle}>No live adopters found yet.</Text>
                  )}
                </Table.Td>
                <Table.Td>
                  <Text style={panelTextDimStyle}>{row.propagation}</Text>
                </Table.Td>
                <Table.Td>
                  <Text style={panelTextDimStyle}>{row.note}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </div>
  );
}

export function BrandTokenWall() {
  return (
    <div className="space-y-5">
      <BrandReadSummary />
      {tokenWallGroups.map((group) => (
        <div key={group.title}>
          <Text fw={600} style={panelTextStyle}>
            {group.title}
          </Text>
          <Text mt={4} style={panelTextDimStyle}>
            {group.description}
          </Text>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
            {group.tokens.map((token) => (
              <TokenWallChip
                key={token.token}
                label={token.label}
                token={token.token}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LaterConsideration() {
  return (
    <div className="space-y-3">
      {laterConsiderationItems.map((item) => (
        <div key={item.title} className={panelCardClassName} style={panelCardStyle}>
          <Text fw={600} style={panelTextStyle}>
            {item.title}
          </Text>
          <Text mt={4} style={panelTextDimStyle}>
            {item.description}
          </Text>
        </div>
      ))}
    </div>
  );
}
