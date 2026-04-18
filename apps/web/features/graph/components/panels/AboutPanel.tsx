"use client";

import Image from "next/image";
import { Badge, Group, Stack, Text } from "@mantine/core";
import {
  Brain,
  Cpu,
  GraduationCap,
  Mail,
  Stethoscope,
} from "lucide-react";
import { PANEL_DOCK_WIDTH_PX } from "@/lib/density";
import { useDashboardStore } from "@/features/graph/stores";
import {
  PanelBody,
  PanelDivider,
  PanelShell,
  panelTextStyle,
  panelTextMutedStyle,
  panelTextDimStyle,
  panelStatValueStyle,
  panelCardStyle,
  panelScaledPx,
  sectionLabelStyle,
  badgeAccentStyles,
} from "./PanelShell";

const BACKGROUND = [
  {
    icon: Stethoscope,
    title: "Clinical",
    detail: "Clinical Chief of CL Psychiatry, SCVMC",
  },
  {
    icon: Cpu,
    title: "Technology",
    detail: "National Discussant for AI in Psychiatry",
  },
  {
    icon: Brain,
    title: "Neuroscience",
    detail: "Translational neuropsychiatry & mechanism-informed models",
  },
] as const;

const TRAINING = [
  {
    icon: Stethoscope,
    title: "CL Psychiatry Fellowship",
    detail: "Stanford Medicine",
  },
  {
    icon: GraduationCap,
    title: "Medical Doctor",
    detail: "Stanford Medicine",
  },
  {
    icon: Brain,
    title: "Master of Science, Molecular Neuroscience",
    detail: "Johns Hopkins University",
  },
] as const;

export function AboutPanel() {
  const closePanel = useDashboardStore((s) => s.closePanel);

  return (
    <PanelShell
      id="about"
      title="About"
      defaultWidth={PANEL_DOCK_WIDTH_PX.about}
      onClose={() => closePanel("about")}
    >
      <PanelBody>
        <Stack gap="sm">
          {(
            [
              /* Photo + name */
              <div key="photo" className="flex items-center gap-3">
                <Image
                  src="/jon-sole-photo.webp"
                  width={48}
                  height={48}
                  alt="Jon Sole"
                  className="rounded-full object-cover"
                  style={{ width: panelScaledPx(48), height: panelScaledPx(48) }}
                />
                <div>
                  <Text fw={600} style={{ ...panelTextStyle, fontSize: panelScaledPx(13) }}>
                    Jon Sole, MD
                  </Text>
                  <Group gap={6} mt={4}>
                    <Badge size="xs" styles={badgeAccentStyles}>
                      Psychiatrist
                    </Badge>
                    <Badge size="xs" styles={badgeAccentStyles}>
                      Neuroscientist
                    </Badge>
                  </Group>
                  <Group gap={6} mt={4}>
                    <Badge size="xs" styles={badgeAccentStyles}>
                      Tinkerer
                    </Badge>
                    <Badge size="xs" styles={badgeAccentStyles}>
                      Plant Dad
                    </Badge>
                  </Group>
                </div>
              </div>,

              /* About */
              <div key="about">
                <Text fw={600} mb={4} style={sectionLabelStyle}>
                  About
                </Text>
                <Text style={{ ...panelTextStyle, lineHeight: panelScaledPx(18) }}>
                  Psychiatry carries real morbidity and mortality, and its empirical
                  foundation is still evolving. On the path toward evidence-based
                  care, SoleMD maps the connections between what evidence we do
                  have - so clinicians, researchers, and learners can navigate the
                  complexity with evidence-informed pathways. Ask questions, explore
                  the map, and see what connections emerge.
                </Text>
              </div>,

              /* Background */
              <div key="background">
                <Text fw={600} mb={4} style={sectionLabelStyle}>
                  Background
                </Text>
                <div className="grid grid-cols-3 gap-2">
                  {BACKGROUND.map(({ icon: Icon, title, detail }) => (
                    <div
                      key={title}
                      className="flex flex-col items-center rounded-lg px-2 py-2"
                      style={panelCardStyle}
                    >
                      <Icon
                        size={14}
                        style={{ color: "var(--mode-accent)", marginBottom: 4 }}
                      />
                      <Text
                        fw={700}
                        style={{ ...panelStatValueStyle, textAlign: "center" }}
                      >
                        {title}
                      </Text>
                      <Text
                        style={{
                          ...panelTextMutedStyle,
                          fontSize: panelScaledPx(9),
                          textAlign: "center",
                        }}
                      >
                        {detail}
                      </Text>
                    </div>
                  ))}
                </div>
              </div>,

              /* Training / Education */
              <div key="training">
                <Text fw={600} mb={4} style={sectionLabelStyle}>
                  Training &amp; Education
                </Text>
                <Stack gap={6}>
                  {TRAINING.map(({ icon: Icon, title, detail }) => (
                    <div key={title} className="flex items-start gap-2.5">
                      <div
                        className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md"
                        style={{ backgroundColor: "var(--mode-accent-subtle)" }}
                      >
                        <Icon
                          size={12}
                          style={{ color: "var(--mode-accent)" }}
                        />
                      </div>
                      <div>
                        <Text fw={600} style={panelTextStyle}>
                          {title}
                        </Text>
                        <Text style={panelTextDimStyle}>{detail}</Text>
                      </div>
                    </div>
                  ))}
                </Stack>
              </div>,

              /* Contact */
              <div key="contact">
                <Text fw={600} mb={4} style={sectionLabelStyle}>
                  Contact
                </Text>
                <div className="flex items-center gap-2">
                  <Mail size={12} style={{ color: "var(--mode-accent)" }} />
                  <Text style={panelTextDimStyle}>jon@solemd.org</Text>
                </div>
              </div>,

              /* Credits */
              <div key="credits">
                <Text fw={600} mb={4} style={sectionLabelStyle}>
                  Credits
                </Text>
                <Stack gap={2}>
                  <Text style={panelTextDimStyle}>
                    Visualized by{" "}
                    <a
                      href="https://cosmograph.app/"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--mode-accent)" }}
                    >
                      cosmograph.app
                    </a>
                  </Text>
                  <Text style={panelTextDimStyle}>
                    Powered by{" "}
                    <a
                      href="https://www.semanticscholar.org/"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--mode-accent)" }}
                    >
                      Semantic Scholar
                    </a>
                    {" · "}
                    <a
                      href="https://www.ncbi.nlm.nih.gov/research/pubtator3/"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--mode-accent)" }}
                    >
                      PubTator3
                    </a>
                  </Text>
                </Stack>
              </div>,
            ] as React.ReactNode[]
          ).flatMap((section, i) =>
            i > 0
              ? [<PanelDivider key={`div-${i}`} />, section]
              : [section],
          )}
        </Stack>
      </PanelBody>
    </PanelShell>
  );
}
