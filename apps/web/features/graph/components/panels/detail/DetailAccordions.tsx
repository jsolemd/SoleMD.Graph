"use client";

import { Accordion, Text } from "@mantine/core";
import type {
  GraphSelectionDetail,
} from "@solemd/graph";
import {
  ClusterContent,
  ExemplarsContent,
} from "./remote";
import { accordionStyles, panelTextStyle } from "./ui";

export function DetailAccordions({
  detail,
}: {
  detail: GraphSelectionDetail | null;
}) {
  return (
    <Accordion variant="default" className="detail-accordion" styles={accordionStyles}>
      <Accordion.Item value="cluster">
        <Accordion.Control>Cluster context</Accordion.Control>
        <Accordion.Panel>
          <ClusterContent cluster={detail?.cluster ?? null} />
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item value="exemplars">
        <Accordion.Control>Cluster exemplars</Accordion.Control>
        <Accordion.Panel>
          <ExemplarsContent
            exemplars={detail?.exemplars ?? []}
          />
        </Accordion.Panel>
      </Accordion.Item>

      <Accordion.Item value="abstract">
        <Accordion.Control>Abstract</Accordion.Control>
        <Accordion.Panel>
          <Text style={{ ...panelTextStyle, whiteSpace: "pre-wrap" }}>
            {detail?.paper?.abstract ?? "No abstract available."}
          </Text>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
