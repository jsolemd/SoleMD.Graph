"use client";

import { useState, useEffect } from "react";
import {
  Group,
  Button,
  UnstyledButton,
  Text,
  Burger,
  Drawer,
  ScrollArea,
  rem,
  Box,
  Stack,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { BrainCircuit } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ui/theme-toggle";
import { getCurrentPageColor, navigationLinks } from "@/lib/utils";

/**
 * Main header component for the SoleMD platform
 *
 * Features:
 * - Dynamic page-based coloring system
 * - Responsive navigation with mobile drawer
 * - Scroll-aware styling with backdrop blur
 * - Theme-aware logo and navigation elements
 * - Smooth transitions and animations
 *
 * The header adapts its colors based on the current page:
 * - Logo background matches current page theme
 * - "MD" text color matches current page theme
 * - Navigation links show active state with page colors
 * - CTA button adapts to scroll state
 *
 * @returns {JSX.Element} The rendered header component
 */
export default function Header() {
  const [drawerOpened, { toggle: toggleDrawer, close: closeDrawer }] =
    useDisclosure(false);
  // Initialize scrolled state - start with null to prevent flash, then set proper state
  const [scrolled, setScrolled] = useState<boolean | null>(null);
  const pathname = usePathname();
  const isSleepNeurobiologyPage = pathname?.startsWith("/education/neuroscience/sleep-neurobiology");
  const isScrolled = Boolean(scrolled);

  useEffect(() => {
    // Set initial scroll state immediately on mount
    const initialScrolled = window.scrollY > 50;
    setScrolled(initialScrolled);

    const handleScroll = () => {
      const isScrolled = window.scrollY > 50;
      setScrolled(isScrolled);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const items = navigationLinks.map((link) => (
    <UnstyledButton
      key={link.label}
      component={Link}
      href={link.link}
      onClick={closeDrawer}
      style={{
        display: "block",
        lineHeight: 1,
        padding: `${rem(8)} ${rem(12)}`,
        textDecoration: "none",
        color:
          pathname === link.link ? link.color : "var(--mantine-color-text)",
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
      {/* Active indicator dot */}
      {pathname === link.link && (
        <Box
          style={{
            position: "absolute",
            bottom: rem(-2),
            left: "50%",
            transform: "translateX(-50%)",
            width: rem(4),
            height: rem(4),
            borderRadius: "50%",
            backgroundColor: link.color,
          }}
        />
      )}
    </UnstyledButton>
  ));

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        padding: isScrolled ? rem(12) : rem(16),
        opacity: isSleepNeurobiologyPage && isScrolled ? 0 : 1,
        pointerEvents: isSleepNeurobiologyPage && isScrolled ? "none" : "auto",
        transition: "opacity 220ms ease, padding 300ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      <Box
        style={{
          maxWidth: rem(1200),
          margin: "0 auto",
          backgroundColor: "transparent",
          position: "relative",
          border: isScrolled
            ? "1px solid hsl(var(--border) / 0.3)"
            : "1px solid hsl(var(--border) / 0.05)",
          borderRadius: rem(50),
          padding: isScrolled ? `${rem(8)} ${rem(20)}` : `${rem(12)} ${rem(24)}`,
          backdropFilter: isSleepNeurobiologyPage ? "blur(12px)" : isScrolled ? "blur(20px)" : "blur(5px)",
          boxShadow: isScrolled
            ? "0 4px 20px hsl(var(--foreground) / 0.08)"
            : "0 2px 8px hsl(var(--foreground) / 0.02)",
          transition: "all 300ms cubic-bezier(0.4, 0, 0.2, 1)",
          transform: isScrolled ? "scale(0.98)" : "scale(1)",
        }}
      >
        {/* Background layer with opacity */}
        {isScrolled && (
          <Box
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "var(--mantine-color-body)",
              borderRadius: rem(50),
              opacity: 0.96,
              zIndex: -1,
            }}
          />
        )}
        <Group justify="space-between" align="center">
          {/* Logo */}
          <UnstyledButton component={Link} href="/">
            <Group gap={rem(8)} align="center">
              <Box
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
              >
                <BrainCircuit size={16} color="white" />
              </Box>
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

          {/* Desktop Navigation */}
          <Group gap={rem(4)} visibleFrom="sm">
            {items}
          </Group>

          {/* Desktop Actions */}
          <Group gap="sm" visibleFrom="sm">
            <ThemeToggle />
            <Button
              size="sm"
              radius="xl"
              style={{
                backgroundColor: isScrolled
                  ? getCurrentPageColor(pathname)
                  : "var(--mantine-color-body)",
                color: isScrolled ? "white" : getCurrentPageColor(pathname),
                border: `2px solid ${getCurrentPageColor(pathname)}`,
                fontWeight: 600,
                transition: scrolled !== null ? "all 300ms ease" : "none",
                opacity: scrolled !== null ? 1 : 0,
              }}
            >
              Get Started
            </Button>
          </Group>

          {/* Mobile Menu */}
          <Group hiddenFrom="sm">
            <ThemeToggle />
            <Burger opened={drawerOpened} onClick={toggleDrawer} size="sm" />
          </Group>
        </Group>
      </Box>

      {/* Mobile Drawer */}
      <Drawer
        opened={drawerOpened}
        onClose={closeDrawer}
        size="100%"
        padding="md"
        title="Navigation"
        hiddenFrom="sm"
        zIndex={1000000}
      >
        <ScrollArea h={`calc(100vh - ${rem(80)})`} mx="-md">
          <Stack gap="md" p="md">
            {navigationLinks.map((link) => (
              <UnstyledButton
                key={link.label}
                component={Link}
                href={link.link}
                onClick={closeDrawer}
                style={{
                  display: "block",
                  width: "100%",
                  padding: rem(12),
                  borderRadius: rem(8),
                  textDecoration: "none",
                  color:
                    pathname === link.link
                      ? link.color
                      : "var(--mantine-color-text)",
                  fontSize: rem(16),
                  fontWeight: pathname === link.link ? 600 : 500,
                  backgroundColor:
                    pathname === link.link
                      ? "var(--mantine-color-gray-0)"
                      : "transparent",
                }}
              >
                {link.label}
              </UnstyledButton>
            ))}
            <Button
              fullWidth
              mt="md"
              radius="xl"
              style={{
                backgroundColor: "var(--background)",
                color: "var(--foreground)",
                border: "1px solid hsl(var(--border) / 0.2)",
                fontWeight: 600,
              }}
            >
              Get Started
            </Button>
          </Stack>
        </ScrollArea>
      </Drawer>
    </header>
  );
}
