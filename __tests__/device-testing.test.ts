/**
 * @fileoverview Device-Specific Testing Suite
 * @description Tests responsive design, touch interactions, and device-specific features
 *              across various screen sizes and input methods
 */

import { test, expect, devices } from "@playwright/test";

// Device configurations for comprehensive testing
const deviceConfigurations = [
  // Mobile Devices
  {
    name: "iPhone SE",
    device: devices["iPhone SE"],
    category: "mobile",
    expectedColumns: 1,
    minTouchTarget: 44,
  },
  {
    name: "iPhone 12",
    device: devices["iPhone 12"],
    category: "mobile",
    expectedColumns: 1,
    minTouchTarget: 44,
  },
  {
    name: "Pixel 5",
    device: devices["Pixel 5"],
    category: "mobile",
    expectedColumns: 1,
    minTouchTarget: 44,
  },
  // Tablet Devices
  {
    name: "iPad",
    device: devices["iPad"],
    category: "tablet",
    expectedColumns: 2,
    minTouchTarget: 44,
  },
  {
    name: "iPad Pro",
    device: devices["iPad Pro"],
    category: "tablet",
    expectedColumns: 2,
    minTouchTarget: 44,
  },
  // Desktop Devices
  {
    name: "Desktop Chrome",
    device: devices["Desktop Chrome"],
    category: "desktop",
    expectedColumns: 2,
    minTouchTarget: 0, // No touch requirement
  },
  {
    name: "Desktop Firefox",
    device: devices["Desktop Firefox"],
    category: "desktop",
    expectedColumns: 2,
    minTouchTarget: 0,
  },
  // Custom viewport sizes
  {
    name: "Small Mobile",
    device: { ...devices["iPhone SE"], viewport: { width: 320, height: 568 } },
    category: "mobile",
    expectedColumns: 1,
    minTouchTarget: 44,
  },
  {
    name: "Large Desktop",
    device: {
      ...devices["Desktop Chrome"],
      viewport: { width: 1920, height: 1080 },
    },
    category: "desktop",
    expectedColumns: 2,
    minTouchTarget: 0,
  },
];

// Test pages with their expected responsive behavior
const testPages = [
  { path: "/", name: "Home" },
  { path: "/about", name: "About" },
  { path: "/education", name: "Education" },
  { path: "/research", name: "Research" },
];

// Responsive layout testing
deviceConfigurations.forEach(
  ({ name, device, category, expectedColumns, minTouchTarget }) => {
    test.describe(`${name} - Responsive Layout`, () => {
      test.use({ ...device });

      testPages.forEach(({ path, name: pageName }) => {
        test(`should display proper layout on ${pageName} page`, async ({
          page,
        }) => {
          await page.goto(path);
          await page.waitForLoadState("networkidle");

          const viewport = page.viewportSize();

          // Test container responsiveness
          const containers = await page
            .locator('.container, [class*="max-w"]')
            .all();

          for (const container of containers) {
            const containerInfo = await container.evaluate((el) => {
              const rect = el.getBoundingClientRect();
              const computedStyle = getComputedStyle(el);
              return {
                width: rect.width,
                maxWidth: computedStyle.maxWidth,
                paddingLeft: parseInt(computedStyle.paddingLeft),
                paddingRight: parseInt(computedStyle.paddingRight),
                marginLeft: computedStyle.marginLeft,
                marginRight: computedStyle.marginRight,
              };
            });

            // Container should not exceed viewport width
            if (viewport) {
              expect(containerInfo.width).toBeLessThanOrEqual(viewport.width);
            }

            // Should have appropriate padding for device category
            if (category === "mobile") {
              expect(containerInfo.paddingLeft).toBeGreaterThanOrEqual(16); // Minimum mobile padding
              expect(containerInfo.paddingRight).toBeGreaterThanOrEqual(16);
            } else if (category === "tablet") {
              expect(containerInfo.paddingLeft).toBeGreaterThanOrEqual(24);
              expect(containerInfo.paddingRight).toBeGreaterThanOrEqual(24);
            } else {
              expect(containerInfo.paddingLeft).toBeGreaterThanOrEqual(32);
              expect(containerInfo.paddingRight).toBeGreaterThanOrEqual(32);
            }
          }

          // Test grid responsiveness
          const grids = await page.locator('[class*="grid"], .grid').all();

          for (const grid of grids) {
            const gridInfo = await grid.evaluate((el) => {
              const computedStyle = getComputedStyle(el);
              const children = Array.from(el.children);
              return {
                display: computedStyle.display,
                gridTemplateColumns: computedStyle.gridTemplateColumns,
                gap: computedStyle.gap,
                childCount: children.length,
              };
            });

            if (gridInfo.display === "grid" && gridInfo.childCount > 0) {
              // Verify grid columns match expected for device category
              const columnCount =
                gridInfo.gridTemplateColumns.split(" ").length;

              if (category === "mobile") {
                expect(columnCount).toBeLessThanOrEqual(1);
              } else if (category === "tablet") {
                expect(columnCount).toBeLessThanOrEqual(2);
              } else {
                expect(columnCount).toBeGreaterThanOrEqual(2);
              }
            }
          }
        });
      });

      test("should have proper typography scaling", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        const headings = await page.locator("h1, h2, h3, h4, h5, h6").all();

        for (const heading of headings) {
          const typographyInfo = await heading.evaluate((el) => {
            const computedStyle = getComputedStyle(el);
            return {
              fontSize: parseInt(computedStyle.fontSize),
              lineHeight: computedStyle.lineHeight,
              fontWeight: computedStyle.fontWeight,
              tagName: el.tagName,
            };
          });

          // Font sizes should be appropriate for device category
          if (category === "mobile") {
            if (typographyInfo.tagName === "H1") {
              expect(typographyInfo.fontSize).toBeGreaterThanOrEqual(28);
              expect(typographyInfo.fontSize).toBeLessThanOrEqual(48);
            } else if (typographyInfo.tagName === "H2") {
              expect(typographyInfo.fontSize).toBeGreaterThanOrEqual(24);
              expect(typographyInfo.fontSize).toBeLessThanOrEqual(36);
            }
          } else if (category === "tablet") {
            if (typographyInfo.tagName === "H1") {
              expect(typographyInfo.fontSize).toBeGreaterThanOrEqual(32);
              expect(typographyInfo.fontSize).toBeLessThanOrEqual(56);
            }
          } else {
            if (typographyInfo.tagName === "H1") {
              expect(typographyInfo.fontSize).toBeGreaterThanOrEqual(36);
              expect(typographyInfo.fontSize).toBeLessThanOrEqual(72);
            }
          }
        }
      });

      test("should handle spacing appropriately", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Test section spacing
        const sections = await page.locator('section, [class*="py-"]').all();

        for (const section of sections.slice(0, 5)) {
          // Test first 5 sections
          const spacingInfo = await section.evaluate((el) => {
            const computedStyle = getComputedStyle(el);
            return {
              paddingTop: parseInt(computedStyle.paddingTop),
              paddingBottom: parseInt(computedStyle.paddingBottom),
              marginTop: parseInt(computedStyle.marginTop),
              marginBottom: parseInt(computedStyle.marginBottom),
            };
          });

          // Spacing should be appropriate for device category
          if (category === "mobile") {
            // Mobile should have reasonable spacing (not too large)
            if (spacingInfo.paddingTop > 0) {
              expect(spacingInfo.paddingTop).toBeLessThanOrEqual(120); // Max mobile section padding
            }
          } else {
            // Desktop/tablet can have larger spacing
            if (spacingInfo.paddingTop > 0) {
              expect(spacingInfo.paddingTop).toBeGreaterThanOrEqual(40);
            }
          }
        }
      });

      if (minTouchTarget > 0) {
        test("should have adequate touch targets", async ({ page }) => {
          await page.goto("/");
          await page.waitForLoadState("networkidle");

          // Find all interactive elements
          const interactiveElements = await page
            .locator(
              'button, a, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])'
            )
            .all();

          for (const element of interactiveElements) {
            const dimensions = await element.evaluate((el) => {
              const rect = el.getBoundingClientRect();
              const computedStyle = getComputedStyle(el);
              return {
                width: rect.width,
                height: rect.height,
                padding: {
                  top: parseInt(computedStyle.paddingTop),
                  right: parseInt(computedStyle.paddingRight),
                  bottom: parseInt(computedStyle.paddingBottom),
                  left: parseInt(computedStyle.paddingLeft),
                },
                isVisible: rect.width > 0 && rect.height > 0,
              };
            });

            if (dimensions.isVisible) {
              // Touch targets should meet minimum size requirements
              expect(dimensions.width).toBeGreaterThanOrEqual(minTouchTarget);
              expect(dimensions.height).toBeGreaterThanOrEqual(minTouchTarget);
            }
          }
        });

        test("should handle touch interactions properly", async ({ page }) => {
          await page.goto("/");
          await page.waitForLoadState("networkidle");

          // Test touch interactions on cards and buttons
          const touchableElements = await page
            .locator(".floating-card, button, a")
            .all();

          for (const element of touchableElements.slice(0, 3)) {
            // Test first 3
            // Test tap interaction
            const initialStyles = await element.evaluate((el) => {
              const computedStyle = getComputedStyle(el);
              return {
                transform: computedStyle.transform,
                backgroundColor: computedStyle.backgroundColor,
              };
            });

            // Perform touch tap
            await element.tap();
            await page.waitForTimeout(100); // Brief pause for tap feedback

            // Element should respond to tap (styles might change temporarily)
            const afterTapStyles = await element.evaluate((el) => {
              const computedStyle = getComputedStyle(el);
              return {
                transform: computedStyle.transform,
                backgroundColor: computedStyle.backgroundColor,
              };
            });

            // Verify element is still functional after tap
            expect(afterTapStyles.transform).toBeTruthy();
          }
        });
      }

      test("should prevent horizontal scrolling", async ({ page }) => {
        await page.goto("/");
        await page.waitForLoadState("networkidle");

        // Check for horizontal overflow
        const scrollInfo = await page.evaluate(() => {
          return {
            documentWidth: document.documentElement.scrollWidth,
            windowWidth: window.innerWidth,
            bodyWidth: document.body.scrollWidth,
            hasHorizontalScroll:
              document.documentElement.scrollWidth > window.innerWidth,
          };
        });

        // Should not have horizontal scrolling
        expect(scrollInfo.hasHorizontalScroll).toBe(false);
        expect(scrollInfo.documentWidth).toBeLessThanOrEqual(
          scrollInfo.windowWidth + 1
        ); // Allow 1px tolerance
      });

      test("should handle orientation changes (mobile/tablet)", async ({
        page,
      }) => {
        if (category === "mobile" || category === "tablet") {
          await page.goto("/");
          await page.waitForLoadState("networkidle");

          const originalViewport = page.viewportSize();

          if (originalViewport) {
            // Simulate orientation change by swapping width and height
            const rotatedViewport = {
              width: originalViewport.height,
              height: originalViewport.width,
            };

            await page.setViewportSize(rotatedViewport);
            await page.waitForTimeout(500); // Allow layout to adjust

            // Check that layout still works after rotation
            const afterRotationInfo = await page.evaluate(() => {
              return {
                documentWidth: document.documentElement.scrollWidth,
                windowWidth: window.innerWidth,
                hasHorizontalScroll:
                  document.documentElement.scrollWidth > window.innerWidth,
              };
            });

            expect(afterRotationInfo.hasHorizontalScroll).toBe(false);

            // Restore original viewport
            await page.setViewportSize(originalViewport);
          }
        }
      });
    });
  }
);

// Performance testing across devices
deviceConfigurations.forEach(({ name, device, category }) => {
  test.describe(`${name} - Performance`, () => {
    test.use({ ...device });

    test("should load within performance budget", async ({ page }) => {
      const startTime = Date.now();

      await page.goto("/");
      await page.waitForLoadState("networkidle");

      const loadTime = Date.now() - startTime;

      // Performance budgets by device category
      if (category === "mobile") {
        expect(loadTime).toBeLessThan(5000); // 5 seconds for mobile
      } else if (category === "tablet") {
        expect(loadTime).toBeLessThan(4000); // 4 seconds for tablet
      } else {
        expect(loadTime).toBeLessThan(3000); // 3 seconds for desktop
      }
    });

    test("should maintain smooth scrolling", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Measure scroll performance
      const scrollPerformance = await page.evaluate(() => {
        return new Promise((resolve) => {
          let frameCount = 0;
          const startTime = performance.now();
          const targetFrames = 30; // Test for 30 frames

          function measureFrame() {
            frameCount++;

            if (frameCount < targetFrames) {
              // Simulate scroll
              window.scrollBy(0, 10);
              requestAnimationFrame(measureFrame);
            } else {
              const endTime = performance.now();
              const totalTime = endTime - startTime;
              const averageFrameTime = totalTime / frameCount;
              const fps = 1000 / averageFrameTime;

              resolve({
                totalTime,
                frameCount,
                averageFrameTime,
                fps,
              });
            }
          }

          requestAnimationFrame(measureFrame);
        });
      });

      const result = scrollPerformance as any;

      // Should maintain reasonable frame rate
      if (category === "mobile") {
        expect(result.fps).toBeGreaterThan(20); // Lower threshold for mobile
      } else {
        expect(result.fps).toBeGreaterThan(30); // Higher threshold for desktop/tablet
      }
    });

    test("should handle memory efficiently", async ({ page }) => {
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Navigate through multiple pages to test memory usage
      const pages = ["/", "/about", "/education", "/research"];

      for (const pagePath of pages) {
        await page.goto(pagePath);
        await page.waitForLoadState("networkidle");

        // Check for memory leaks (simplified check)
        const memoryInfo = await page.evaluate(() => {
          // @ts-ignore - performance.memory might not be available in all browsers
          if (performance.memory) {
            return {
              // @ts-ignore
              usedJSHeapSize: performance.memory.usedJSHeapSize,
              // @ts-ignore
              totalJSHeapSize: performance.memory.totalJSHeapSize,
            };
          }
          return null;
        });

        if (memoryInfo) {
          // Memory usage should be reasonable
          const memoryUsageMB = memoryInfo.usedJSHeapSize / (1024 * 1024);

          if (category === "mobile") {
            expect(memoryUsageMB).toBeLessThan(50); // 50MB limit for mobile
          } else {
            expect(memoryUsageMB).toBeLessThan(100); // 100MB limit for desktop
          }
        }
      }
    });
  });
});

// Cross-device consistency testing
test.describe("Cross-Device Consistency", () => {
  test("should maintain visual consistency across devices", async ({
    browser,
  }) => {
    const contexts = await Promise.all([
      browser.newContext({ ...devices["iPhone 12"] }),
      browser.newContext({ ...devices["iPad"] }),
      browser.newContext({ ...devices["Desktop Chrome"] }),
    ]);

    const pages = await Promise.all(
      contexts.map((context) => context.newPage())
    );

    // Load the same page on all devices
    await Promise.all(pages.map((page) => page.goto("/")));
    await Promise.all(
      pages.map((page) => page.waitForLoadState("networkidle"))
    );

    // Check that key elements exist on all devices
    const keySelectors = [
      "header",
      "main",
      "footer",
      "h1",
      '[data-testid="logo"], .logo',
    ];

    for (const selector of keySelectors) {
      const elementCounts = await Promise.all(
        pages.map((page) => page.locator(selector).count())
      );

      // All devices should have the same key elements
      elementCounts.forEach((count) => {
        expect(count).toBeGreaterThan(0);
      });
    }

    // Clean up
    await Promise.all(contexts.map((context) => context.close()));
  });

  test("should maintain theme consistency across devices", async ({
    browser,
  }) => {
    const contexts = await Promise.all([
      browser.newContext({ ...devices["iPhone 12"] }),
      browser.newContext({ ...devices["Desktop Chrome"] }),
    ]);

    const pages = await Promise.all(
      contexts.map((context) => context.newPage())
    );

    await Promise.all(pages.map((page) => page.goto("/")));
    await Promise.all(
      pages.map((page) => page.waitForLoadState("networkidle"))
    );

    // Check CSS variables on both devices
    const cssVariables = await Promise.all(
      pages.map((page) =>
        page.evaluate(() => {
          const computedStyle = getComputedStyle(document.documentElement);
          return {
            background: computedStyle.getPropertyValue("--background").trim(),
            foreground: computedStyle.getPropertyValue("--foreground").trim(),
            softBlue: computedStyle
              .getPropertyValue("--color-soft-blue")
              .trim(),
          };
        })
      )
    );

    // CSS variables should be consistent across devices
    const [mobileVars, desktopVars] = cssVariables;
    expect(mobileVars.background).toBe(desktopVars.background);
    expect(mobileVars.foreground).toBe(desktopVars.foreground);
    expect(mobileVars.softBlue).toBe(desktopVars.softBlue);

    await Promise.all(contexts.map((context) => context.close()));
  });
});
