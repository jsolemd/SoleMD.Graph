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
import { useDashboardStore } from "@/lib/graph/stores";
import {
  PanelShell,
  panelTextStyle,
  panelTextMutedStyle,
  panelTextDimStyle,
  panelStatValueStyle,
  panelCardStyle,
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
  const setActivePanel = useDashboardStore((s) => s.setActivePanel);

  return (
    <PanelShell
      title="About"
      side="left"
      width={320}
      onClose={() => setActivePanel(null)}
    >
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <Stack gap="md">
          {/* Photo + name */}
          <div className="flex items-center gap-3">
            <Image
              src="/jon-sole-photo.webp"
              width={48}
              height={48}
              alt="Jon Sole"
              className="rounded-full object-cover"
              style={{ width: 48, height: 48 }}
            />
            <div>
              <Text fw={600} style={{ ...panelTextStyle, fontSize: 13 }}>
                Jon Sole, MD
              </Text>
              <Group gap={6} mt={4}>
                <Badge
                  size="xs"
                  styles={badgeAccentStyles}
                >
                  Psychiatrist
                </Badge>
                <Badge
                  size="xs"
                  styles={badgeAccentStyles}
                >
                  Neuroscientist
                </Badge>
              </Group>
              <Group gap={6} mt={4}>
                <Badge
                  size="xs"
                  styles={badgeAccentStyles}
                >
                  Tinkerer
                </Badge>
                <Badge
                  size="xs"
                  styles={badgeAccentStyles}
                >
                  Plant Dad
                </Badge>
              </Group>
            </div>
          </div>

          {/* Bio */}
          <div>
            <Text fw={600} mb={4} style={sectionLabelStyle}>
              About
            </Text>
            <Text style={{ ...panelTextStyle, lineHeight: "18px" }}>
              Bridging neuroscience, clinical care, and technology to transform
              mental health education. Trained in molecular neuroscience at Johns
              Hopkins and psychiatry at Stanford. Chief of CL Psychiatry at
              SCVMC, coordinating multidisciplinary care for medically complex
              patients.
            </Text>
          </div>

          {/* Background */}
          <div>
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
                      fontSize: 9,
                      textAlign: "center",
                    }}
                  >
                    {detail}
                  </Text>
                </div>
              ))}
            </div>
          </div>

          {/* Training / Education */}
          <div>
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
          </div>

          {/* SoleMD */}
          <div>
            <Text fw={600} mb={4} style={sectionLabelStyle}>
              SoleMD
            </Text>
            <Text style={{ ...panelTextStyle, lineHeight: "18px" }}>
              A biomedical knowledge graph connecting psychiatric research,
              clinical evidence, and educational resources. Built to help
              clinicians, researchers, and learners navigate the complexity of
              modern neuroscience and psychiatry.
            </Text>
          </div>

          {/* Contact */}
          <div>
            <Text fw={600} mb={4} style={sectionLabelStyle}>
              Contact
            </Text>
            <div className="flex items-center gap-2">
              <Mail size={12} style={{ color: "var(--mode-accent)" }} />
              <Text style={panelTextDimStyle}>jon@solemd.com</Text>
            </div>
          </div>
        </Stack>
      </div>
    </PanelShell>
  );
}
