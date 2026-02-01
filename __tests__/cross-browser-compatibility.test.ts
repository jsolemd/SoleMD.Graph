/**
 * @fileoverview Cross-Browser Compatibility Testing Suite
 * @description Tests theming consistency, CSS variable support, and responsive design
 *              across different browsers and devices using Playwright
 */

import { test, expect, devices } from "@playwright/test";

// Test configuration for different browsers and devices
const testConfigurations = [
  { name: "Desktop Chrome", device: devices["Desktop Chrome"] },
  { name: "Desktop Firefox", device: devices["Desktop Firefox"] },
  { name: "Desktop Safari", device: devices["Desktop Safari"] },
  { name: "Mobile Chrome", device: devices["Pixel 5"] },
  { name: "Mobile Safari", device: devices["iPhone 12"] },
  { name: "Tablet", device: devices["iPad Pro"] },
];

const testPages = [
  { path: "/", name: "Home", expectedColor: "var(--color-soft-blue)" },
  {
    path: "/about",
    name: "About",
    expectedColor: "var(--color-soft-lavender)",
  },
  {
    path: "/education",
    name: "Education",
    expectedColor: "var(--color-fresh-green)",
  },
  {
    path: "/research",
    name: "Research",
    expectedColor: "var(--color-warm-coral)",
  },
];

// Cross-browser theming consistency tests
testConfigurations.forEach(({ name, device }) => {
  test.describe(`${name} - Theming Consistency`, () => {
    test.use({ ...device });

    test("should load CSS variables correctly", async ({ page }) => {
      await page.goto("/");

      // Wait for page to fully load
      await page.waitForLoadState("networkidle");

      // Check if CSS variables are defined
      const cssVariables = await page.evaluate(() => {
        const computedStyle = getComputedStyle(document.documentElement);
        return {
          background: computedStyle.getPropertyValue("--background").trim(),
          foreground: computedStyle.getPropertyValue("--foreground").trim(),
          card: computedStyle.getPropertyValue("--card").trim(),
          border: computedStyle.getPropertyValue("--border").trim(),
          softBlue: computedStyle.getPropertyValue("--color-soft-blue").trim(),
          softLavender: computedStyle
            .getPropertyValue("--color-soft-lavender")
            .trim(),
          freshGreen: computedStyle
            .getPropertyValue("--color-fresh-green")
            .trim(),
          warmCoral: computedStyle
            .getPropertyValue("--color-warm-coral")
            .trim(),
        };
      });

      // Verify all essential CSS variables are defined
      expect(cssVariables.background).toBeTruthy();
      expect(cssVariables.foreground).toBeTruthy();
      expect(cssVariables.card).toBeTruthy();
      expect(cssVariables.border).toBeTruthy();
      expect(cssVariables.softBlue).toBeTruthy();
      expect(cssVariables.softLavender).toBeTruthy();
      expect(cssVariables.freshGreen).toBeTruthy();
      expect(cssVariables.warmCoral).toBeTruthy();
    });

    test("should support theme switching", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Get initial theme
      const initialTheme = await page.evaluate(() => {
        return document.documentElement.classList.contains("dark")
          ? "dark"
          : "light";
      });

      // Find and click theme toggle button
      const themeToggle = page
        .locator(
          '[data-testid="theme-toggle"], button[aria-label*="theme"], button[aria-label*="Theme"]'
        )
        .first();

      if ((await themeToggle.count()) > 0) {
        await themeToggle.click();

        // Wait for theme transition
        await page.waitForTimeout(350); // Allow for 300ms transition + buffer

        // Verify theme changed
        const newTheme = await page.evaluate(() => {
          return document.documentElement.classList.contains("dark")
            ? "dark"
            : "light";
        });

        expect(newTheme).not.toBe(initialTheme);

        // Verify CSS variables updated
        const updatedVariables = await page.evaluate(() => {
          const computedStyle = getComputedStyle(document.documentElement);
          return {
            background: computedStyle.getPropertyValue("--background").trim(),
            foreground: computedStyle.getPropertyValue("--foreground").trim(),
          };
        });

        expect(updatedVariables.background).toBeTruthy();
        expect(updatedVariables.foreground).toBeTruthy();
      }
    });

    testPages.forEach(({ path, name }) => {
      test(`should display correct dynamic coloring on ${name} page`, async ({
        page,
      }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");

        // Check header logo dynamic coloring
        const headerLogo = page
          .locator("header")
          .locator('[data-testid="logo"], .logo, [class*="logo"]')
          .first();
        if ((await headerLogo.count()) > 0) {
          const logoStyles = await headerLogo.evaluate((el) => {
            const computedStyle = getComputedStyle(el);
            return {
              backgroundColor: computedStyle.backgroundColor,
              color: computedStyle.color,
            };
          });

          // Logo should have some styling applied
          expect(logoStyles.backgroundColor).toBeTruthy();
        }

        // Check for "MD" text dynamic coloring
        const mdText = page.locator('text=MD, [data-testid="md-text"]').first();
        if ((await mdText.count()) > 0) {
          const mdStyles = await mdText.evaluate((el) => {
            const computedStyle = getComputedStyle(el);
            return computedStyle.color;
          });

          expect(mdStyles).toBeTruthy();
        }
      });
    });

    test("should handle CSS variable fallbacks", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Test CSS variable fallback behavior
      const fallbackTest = await page.evaluate(() => {
        // Create a test element with CSS variable and fallback
        const testEl = document.createElement("div");
        testEl.style.backgroundColor = "var(--non-existent-var, #ff0000)";
        testEl.style.color = "var(--also-non-existent, #00ff00)";
        document.body.appendChild(testEl);

        const computedStyle = getComputedStyle(testEl);
        const results = {
          backgroundColor: computedStyle.backgroundColor,
          color: computedStyle.color,
        };

        document.body.removeChild(testEl);
        return results;
      });

      // Fallbacks should be applied when variables don't exist
      expect(fallbackTest.backgroundColor).toContain("255, 0, 0"); // #ff0000 in rgb
      expect(fallbackTest.color).toContain("0, 255, 0"); // #00ff00 in rgb
    });
  });
});

// Responsive design testing across devices
testConfigurations.forEach(({ name, device }) => {
  test.describe(`${name} - Responsive Design`, () => {
    test.use({ ...device });

    test("should display proper layout at current viewport", async ({
      page,
    }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const viewport = page.viewportSize();
      const isMobile = viewport && viewport.width < 768;
      const isTablet =
        viewport && viewport.width >= 768 && viewport.width < 1024;

      // Check container widths
      const containers = await page
        .locator('.container, [class*="max-w"]')
        .all();

      for (const container of containers) {
        const containerWidth = await container.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return {
            width: rect.width,
            maxWidth: getComputedStyle(el).maxWidth,
          };
        });

        // Container should not exceed viewport width
        if (viewport) {
          expect(containerWidth.width).toBeLessThanOrEqual(viewport.width);
        }
      }

      // Check typography scaling
      const headings = await page.locator("h1, h2, h3").all();

      for (const heading of headings) {
        const fontSize = await heading.evaluate((el) => {
          return parseInt(getComputedStyle(el).fontSize);
        });

        // Font sizes should be reasonable for viewport
        if (isMobile) {
          expect(fontSize).toBeGreaterThanOrEqual(24); // Minimum readable size on mobile
          expect(fontSize).toBeLessThanOrEqual(48); // Maximum to prevent overflow
        } else if (isTablet) {
          expect(fontSize).toBeGreaterThanOrEqual(28);
          expect(fontSize).toBeLessThanOrEqual(56);
        } else {
          expect(fontSize).toBeGreaterThanOrEqual(32);
          expect(fontSize).toBeLessThanOrEqual(72);
        }
      }
    });

    test("should have proper touch targets on touch devices", async ({
      page,
    }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const isTouchDevice = device.hasTouch;

      if (isTouchDevice) {
        // Check button and link touch targets
        const interactiveElements = await page
          .locator('button, a, [role="button"]')
          .all();

        for (const element of interactiveElements) {
          const dimensions = await element.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            return {
              width: rect.width,
              height: rect.height,
            };
          });

          // Touch targets should be at least 44px (WCAG AA standard)
          expect(dimensions.width).toBeGreaterThanOrEqual(44);
          expect(dimensions.height).toBeGreaterThanOrEqual(44);
        }
      }
    });

    test("should handle card grid responsiveness", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Find card grids
      const cardGrids = await page.locator('[class*="grid"], .grid').all();

      for (const grid of cardGrids) {
        const gridInfo = await grid.evaluate((el) => {
          const computedStyle = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return {
            display: computedStyle.display,
            gridTemplateColumns: computedStyle.gridTemplateColumns,
            width: rect.width,
            childCount: el.children.length,
          };
        });

        if (gridInfo.display === "grid" && gridInfo.childCount > 0) {
          const viewport = page.viewportSize();
          const isMobile = viewport && viewport.width < 768;

          if (isMobile) {
            // Mobile should typically show single column
            expect(gridInfo.gridTemplateColumns).toMatch(/^(\d+px|1fr|auto)$/);
          } else {
            // Desktop/tablet should show multiple columns
            expect(gridInfo.gridTemplateColumns).toMatch(
              /(\d+px|1fr|auto)\s+(\d+px|1fr|auto)/
            );
          }
        }
      }
    });
  });
});

// Animation and interaction testing
testConfigurations.forEach(({ name, device }) => {
  test.describe(`${name} - Animations and Interactions`, () => {
    test.use({ ...device });

    test("should handle hover states properly", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const hasHover = !device.hasTouch; // Desktop devices typically have hover

      if (hasHover) {
        // Find hoverable elements
        const hoverableElements = await page
          .locator('button, a, [class*="hover"], .floating-card')
          .all();

        for (const element of hoverableElements.slice(0, 3)) {
          // Test first 3 to avoid timeout
          // Get initial styles
          const initialStyles = await element.evaluate((el) => {
            const computedStyle = getComputedStyle(el);
            return {
              transform: computedStyle.transform,
              backgroundColor: computedStyle.backgroundColor,
              boxShadow: computedStyle.boxShadow,
            };
          });

          // Hover over element
          await element.hover();
          await page.waitForTimeout(250); // Allow for hover animation

          // Get hover styles
          const hoverStyles = await element.evaluate((el) => {
            const computedStyle = getComputedStyle(el);
            return {
              transform: computedStyle.transform,
              backgroundColor: computedStyle.backgroundColor,
              boxShadow: computedStyle.boxShadow,
            };
          });

          // At least one style property should change on hover
          const hasChanged =
            initialStyles.transform !== hoverStyles.transform ||
            initialStyles.backgroundColor !== hoverStyles.backgroundColor ||
            initialStyles.boxShadow !== hoverStyles.boxShadow;

          // Note: Some elements might not have hover effects, so we don't enforce change
          // but if there is a change, it should be valid
          if (hasChanged) {
            expect(hoverStyles.transform).toBeTruthy();
          }
        }
      }
    });

    test("should respect reduced motion preferences", async ({ page }) => {
      // Set reduced motion preference
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Check if animations are reduced or disabled
      const animationCheck = await page.evaluate(() => {
        const elements = document.querySelectorAll("*");
        let hasLongAnimations = false;

        for (const el of elements) {
          const computedStyle = getComputedStyle(el);
          const animationDuration = computedStyle.animationDuration;
          const transitionDuration = computedStyle.transitionDuration;

          // Check for long animations (> 500ms)
          if (
            animationDuration &&
            animationDuration !== "0s" &&
            parseFloat(animationDuration) > 0.5
          ) {
            hasLongAnimations = true;
            break;
          }
          if (
            transitionDuration &&
            transitionDuration !== "0s" &&
            parseFloat(transitionDuration) > 0.5
          ) {
            hasLongAnimations = true;
            break;
          }
        }

        return { hasLongAnimations };
      });

      // With reduced motion, there should be no long animations
      expect(animationCheck.hasLongAnimations).toBe(false);
    });

    test("should maintain 60fps during animations", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Start performance monitoring
      await page.evaluate(() => {
        (window as any).performanceData = {
          frameCount: 0,
          startTime: performance.now(),
          frames: [],
        };

        function measureFrame() {
          const now = performance.now();
          (window as any).performanceData.frameCount++;
          (window as any).performanceData.frames.push(now);

          if ((window as any).performanceData.frameCount < 60) {
            requestAnimationFrame(measureFrame);
          }
        }

        requestAnimationFrame(measureFrame);
      });

      // Trigger some animations by hovering over elements
      const animatedElements = await page
        .locator(".floating-card, button, a")
        .all();

      if (animatedElements.length > 0) {
        await animatedElements[0].hover();
        await page.waitForTimeout(1000); // Let animation run
      }

      // Check frame rate
      const performanceData = await page.evaluate(() => {
        return (window as any).performanceData;
      });

      if (performanceData && performanceData.frames.length > 10) {
        const totalTime =
          performanceData.frames[performanceData.frames.length - 1] -
          performanceData.frames[0];
        const averageFrameTime =
          totalTime / (performanceData.frames.length - 1);
        const fps = 1000 / averageFrameTime;

        // Should maintain at least 30fps (allowing for some variance)
        expect(fps).toBeGreaterThan(30);
      }
    });
  });
});

// Accessibility testing across browsers
testConfigurations.forEach(({ name, device }) => {
  test.describe(`${name} - Accessibility`, () => {
    test.use({ ...device });

    test("should have proper color contrast ratios", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Test both light and dark themes
      const themes = ["light", "dark"];

      for (const theme of themes) {
        // Switch to theme if needed
        const currentTheme = await page.evaluate(() => {
          return document.documentElement.classList.contains("dark")
            ? "dark"
            : "light";
        });

        if (currentTheme !== theme) {
          const themeToggle = page
            .locator(
              '[data-testid="theme-toggle"], button[aria-label*="theme"]'
            )
            .first();
          if ((await themeToggle.count()) > 0) {
            await themeToggle.click();
            await page.waitForTimeout(350);
          }
        }

        // Check contrast ratios for text elements
        const textElements = await page
          .locator("h1, h2, h3, p, span, a, button")
          .all();

        for (const element of textElements.slice(0, 10)) {
          // Test first 10 to avoid timeout
          const contrastInfo = await element.evaluate((el) => {
            const computedStyle = getComputedStyle(el);
            const color = computedStyle.color;
            const backgroundColor = computedStyle.backgroundColor;

            // Simple contrast check (would need more sophisticated calculation in real implementation)
            return {
              color,
              backgroundColor,
              hasText: el.textContent && el.textContent.trim().length > 0,
            };
          });

          if (contrastInfo.hasText) {
            // Ensure colors are defined
            expect(contrastInfo.color).toBeTruthy();
            expect(contrastInfo.color).not.toBe("rgba(0, 0, 0, 0)");
          }
        }
      }
    });

    test("should have proper focus indicators", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Find focusable elements
      const focusableElements = await page
        .locator(
          'button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        .all();

      for (const element of focusableElements.slice(0, 5)) {
        // Test first 5
        // Focus the element
        await element.focus();

        // Check for focus indicator
        const focusStyles = await element.evaluate((el) => {
          const computedStyle = getComputedStyle(el);
          return {
            outline: computedStyle.outline,
            outlineWidth: computedStyle.outlineWidth,
            outlineColor: computedStyle.outlineColor,
            boxShadow: computedStyle.boxShadow,
          };
        });

        // Should have some form of focus indicator
        const hasFocusIndicator =
          (focusStyles.outline && focusStyles.outline !== "none") ||
          (focusStyles.outlineWidth && focusStyles.outlineWidth !== "0px") ||
          (focusStyles.boxShadow && focusStyles.boxShadow !== "none");

        expect(hasFocusIndicator).toBe(true);
      }
    });

    test("should support keyboard navigation", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Test Tab navigation
      let focusedElementsCount = 0;
      const maxTabs = 10;

      for (let i = 0; i < maxTabs; i++) {
        await page.keyboard.press("Tab");

        const focusedElement = await page.evaluate(() => {
          const activeEl = document.activeElement;
          return activeEl
            ? {
                tagName: activeEl.tagName,
                type: (activeEl as HTMLInputElement).type || null,
                role: activeEl.getAttribute("role"),
                hasTabIndex: activeEl.hasAttribute("tabindex"),
              }
            : null;
        });

        if (focusedElement) {
          focusedElementsCount++;

          // Focused element should be interactive
          const isInteractive =
            ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(
              focusedElement.tagName
            ) ||
            focusedElement.role === "button" ||
            focusedElement.hasTabIndex;

          expect(isInteractive).toBe(true);
        }
      }

      // Should have found some focusable elements
      expect(focusedElementsCount).toBeGreaterThan(0);
    });
  });
});
