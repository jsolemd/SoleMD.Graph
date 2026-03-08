// ./components/layout/Footer.tsx
"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BrainCircuit } from "lucide-react";
import {
  Container,
  Group,
  Text,
  Divider,
  Stack,
  UnstyledButton,
  rem,
} from "@mantine/core";
import { usePathname } from "next/navigation";
import { getCurrentPageColor, navigationLinks } from "@/lib/utils";

/**
 * Footer component for the SoleMD platform
 *
 * Features:
 * - Dynamic page-based coloring system matching header
 * - Responsive layout with centered content
 * - Theme-aware logo and text elements
 * - Consistent branding with header component
 * - Smooth color transitions on page navigation
 * - Additional footer-specific navigation links
 *
 * The footer adapts its colors based on the current page:
 * - Logo background matches current page theme
 * - "MD" text color matches current page theme
 * - Maintains visual consistency with header
 * - Uses centralized navigation configuration
 *
 * @returns {JSX.Element} The rendered footer component
 */
export default function Footer() {
  const pathname = usePathname();

  // Use centralized navigation links plus additional footer-specific links
  const footerLinks = [
    ...navigationLinks.filter((link) => link.link !== "/"), // Exclude home from footer
    { link: "/contact", label: "Contact", color: "var(--color-warm-coral)" },
    {
      link: "/terms",
      label: "Terms of Service",
      color: "var(--color-soft-blue)",
    },
    {
      link: "/privacy",
      label: "Privacy Policy",
      color: "var(--color-soft-blue)",
    },
    { link: "/sitemap", label: "Sitemap", color: "var(--color-soft-blue)" },
  ];

  return (
    <footer
      className="border-t py-12"
      style={{
        borderColor: "var(--border)",
        backgroundColor: "var(--background)",
        transition: "all 300ms ease",
      }}
    >
      <Container size="xl" px="md">
        <Stack align="center" gap="xl">
          {/* Logo Section - Matching Header Implementation */}
          <UnstyledButton component={Link} href="/">
            <Group gap={rem(8)} align="center">
              <motion.div
                style={{
                  width: rem(32),
                  height: rem(32),
                  borderRadius: "50%",
                  backgroundColor: getCurrentPageColor(pathname),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background-color 300ms ease",
                }}
                whileHover={{
                  scale: 1.1,
                  transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
                }}
                whileTap={{ scale: 0.95 }}
              >
                <BrainCircuit size={16} color="white" />
              </motion.div>
              <Group gap={0} align="baseline">
                <Text
                  size="lg"
                  fw={600}
                  style={{ color: "var(--mantine-color-text)" }}
                >
                  Sole
                </Text>
                <Text
                  size="lg"
                  fw={600}
                  style={{
                    color: getCurrentPageColor(pathname),
                    transition: "color 300ms ease",
                  }}
                >
                  MD
                </Text>
              </Group>
            </Group>
          </UnstyledButton>

          {/* Navigation Links - Matching Header Implementation */}
          <Group gap={rem(16)} justify="center" wrap="wrap">
            {footerLinks.map((link) => (
              <UnstyledButton
                key={link.label}
                component={Link}
                href={link.link}
                style={{
                  display: "block",
                  lineHeight: 1,
                  padding: `${rem(8)} ${rem(12)}`,
                  textDecoration: "none",
                  color:
                    pathname === link.link
                      ? link.color
                      : "var(--mantine-color-text)",
                  fontSize: rem(14),
                  fontWeight: pathname === link.link ? 600 : 500,
                  transition: "all 200ms ease",
                  position: "relative",
                }}
                onMouseEnter={(e) => {
                  if (pathname !== link.link) {
                    e.currentTarget.style.color = link.color;
                  }
                }}
                onMouseLeave={(e) => {
                  if (pathname !== link.link) {
                    e.currentTarget.style.color = "var(--mantine-color-text)";
                  }
                }}
              >
                {link.label}
                {/* Active indicator dot - matching Header */}
                {pathname === link.link && (
                  <motion.div
                    style={{
                      position: "absolute",
                      top: rem(-2),
                      left: "50%",
                      transform: "translateX(-50%)",
                      width: rem(4),
                      height: rem(4),
                      borderRadius: "50%",
                      backgroundColor: link.color,
                    }}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  />
                )}
              </UnstyledButton>
            ))}
          </Group>

          <Divider
            className="w-full"
            styles={{
              root: {
                borderColor: "var(--border)",
                transition: "border-color 300ms ease",
              },
            }}
          />

          <Text
            size="sm"
            ta="center"
            style={{
              color: "var(--foreground)",
              opacity: 0.7,
              transition: "color 300ms ease",
            }}
          >
            © {new Date().getFullYear()} SoleMD. All rights reserved.
          </Text>
        </Stack>
      </Container>
    </footer>
  );
}
