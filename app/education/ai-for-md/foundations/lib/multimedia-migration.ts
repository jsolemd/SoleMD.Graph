/**
 * @fileoverview AI for MD Multimedia Migration Utilities
 * @description Specialized utilities for migrating multimedia content from the
 * original AI for MD webapp to the new education module format
 */

import { MultimediaContent, Caption, MediaSource } from "./content-types";
import {
  transformLegacyMultimedia,
  multimediaTracker,
} from "./multimedia-utils";

// =============================================================================
// AI FOR MD SPECIFIC MIGRATION
// =============================================================================

/**
 * Legacy AI for MD content structure (from temp-ai-for-mds)
 */
interface LegacyAIForMDContent {
  icons: Record<string, string>;
  takeaways: Record<string, string>;
  sections?: Array<{
    id: string;
    type: string;
    title: string;
    content: any;
    video?: {
      url: string;
      title: string;
      duration: number;
      thumbnail?: string;
    };
    images?: Array<{
      src: string;
      alt: string;
      caption?: string;
    }>;
    interactive?: {
      type: string;
      config: any;
    };
  }>;
}

/**
 * Migrate AI for MD webapp multimedia content to new format
 */
export async function migrateAIForMDMultimedia(
  legacyData: LegacyAIForMDContent
): Promise<{
  success: boolean;
  migratedContent: MultimediaContent[];
  errors: string[];
  warnings: string[];
}> {
  const migratedContent: MultimediaContent[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Process SVG icons as multimedia content
    const iconContent = await migrateIconsToMultimedia(legacyData.icons);
    migratedContent.push(...iconContent.content);
    errors.push(...iconContent.errors);
    warnings.push(...iconContent.warnings);

    // Process sections if they exist
    if (legacyData.sections) {
      for (const section of legacyData.sections) {
        const sectionContent = await migrateSectionMultimedia(section);
        migratedContent.push(...sectionContent.content);
        errors.push(...sectionContent.errors);
        warnings.push(...sectionContent.warnings);
      }
    }

    // Create takeaway multimedia content
    const takeawayContent = await migrateTakeawaysToMultimedia(
      legacyData.takeaways
    );
    migratedContent.push(...takeawayContent.content);
    errors.push(...takeawayContent.errors);
    warnings.push(...takeawayContent.warnings);

    return {
      success: errors.length === 0,
      migratedContent,
      errors,
      warnings,
    };
  } catch (error) {
    errors.push(
      `Migration failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return {
      success: false,
      migratedContent,
      errors,
      warnings,
    };
  }
}

/**
 * Migrate SVG icons to interactive multimedia content
 */
async function migrateIconsToMultimedia(
  icons: Record<string, string>
): Promise<{
  content: MultimediaContent[];
  errors: string[];
  warnings: string[];
}> {
  const content: MultimediaContent[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [iconName, svgContent] of Object.entries(icons)) {
    try {
      // Convert SVG to data URL for embedding
      const svgDataUrl = `data:image/svg+xml;base64,${btoa(svgContent)}`;

      const multimediaContent: MultimediaContent = {
        id: `icon-${iconName}`,
        type: "multimedia",
        title: `${iconName
          .replace(/-/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase())} Icon`,
        content: {
          mediaType: "image",
          src: svgDataUrl,
          sources: [
            {
              src: svgDataUrl,
              type: "image/svg+xml",
              quality: "vector",
            },
          ],
        },
        metadata: {
          accessibility: {
            altText: generateIconAltText(iconName),
            keyboardNavigation: true,
            highContrast: true,
          },
          analytics: {
            trackCompletion: false,
            trackInteractions: true,
            trackTimeSpent: false,
          },
        },
      };

      content.push(multimediaContent);
    } catch (error) {
      errors.push(
        `Failed to migrate icon ${iconName}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  if (content.length === 0 && Object.keys(icons).length > 0) {
    warnings.push("No icons were successfully migrated");
  }

  return { content, errors, warnings };
}

/**
 * Migrate section multimedia content
 */
async function migrateSectionMultimedia(section: any): Promise<{
  content: MultimediaContent[];
  errors: string[];
  warnings: string[];
}> {
  const content: MultimediaContent[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Migrate video content
    if (section.video) {
      const videoContent = await migrateVideoContent(section.video, section.id);
      content.push(videoContent);
    }

    // Migrate image content
    if (section.images && Array.isArray(section.images)) {
      for (const [index, image] of section.images.entries()) {
        const imageContent = await migrateImageContent(
          image,
          `${section.id}-image-${index}`
        );
        content.push(imageContent);
      }
    }

    // Migrate interactive content as multimedia
    if (section.interactive) {
      const interactiveContent = await migrateInteractiveContent(
        section.interactive,
        `${section.id}-interactive`
      );
      content.push(interactiveContent);
    }
  } catch (error) {
    errors.push(
      `Failed to migrate section ${section.id}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return { content, errors, warnings };
}

/**
 * Migrate video content with enhanced metadata
 */
async function migrateVideoContent(
  video: any,
  sectionId: string
): Promise<MultimediaContent> {
  // Generate multiple quality sources
  const sources: MediaSource[] = [
    {
      src: video.url.replace(/(\.[^.]+)$/, "_720p$1"),
      type: "video/mp4",
      quality: "medium",
    },
    {
      src: video.url.replace(/(\.[^.]+)$/, "_1080p$1"),
      type: "video/mp4",
      quality: "high",
    },
    {
      src: video.url, // Original as fallback
      type: "video/mp4",
      quality: "original",
    },
  ];

  // Generate captions if transcript is available
  const captions: Caption[] = [];
  if (video.transcript) {
    captions.push({
      language: "en",
      src: generateVTTFromTranscript(video.transcript),
      label: "English Captions",
      default: true,
    });
  }

  return {
    id: `${sectionId}-video`,
    type: "multimedia",
    title: video.title || "Educational Video",
    content: {
      mediaType: "video",
      src: video.url,
      sources,
      captions,
      transcript: video.transcript,
    },
    metadata: {
      estimatedDuration: video.duration,
      accessibility: {
        altText: `Educational video: ${video.title}`,
        keyboardNavigation: true,
        highContrast: true,
        reducedMotion: true,
      },
      analytics: {
        trackCompletion: true,
        trackInteractions: true,
        trackTimeSpent: true,
      },
    },
  };
}

/**
 * Migrate image content with responsive sources
 */
async function migrateImageContent(
  image: any,
  imageId: string
): Promise<MultimediaContent> {
  // Generate responsive image sources
  const sources: MediaSource[] = [
    {
      src: image.src.replace(/(\.[^.]+)$/, "_400w.webp"),
      type: "image/webp",
      quality: "small",
    },
    {
      src: image.src.replace(/(\.[^.]+)$/, "_800w.webp"),
      type: "image/webp",
      quality: "medium",
    },
    {
      src: image.src.replace(/(\.[^.]+)$/, "_1200w.webp"),
      type: "image/webp",
      quality: "large",
    },
    {
      src: image.src, // Original as fallback
      type: detectImageType(image.src),
      quality: "original",
    },
  ];

  return {
    id: imageId,
    type: "multimedia",
    title: image.caption || "Educational Image",
    content: {
      mediaType: "image",
      src: image.src,
      sources,
    },
    metadata: {
      accessibility: {
        altText:
          image.alt || image.caption || "Educational diagram or illustration",
        keyboardNavigation: true,
        highContrast: true,
      },
      analytics: {
        trackCompletion: false,
        trackInteractions: true,
        trackTimeSpent: false,
      },
    },
  };
}

/**
 * Migrate interactive content as multimedia
 */
async function migrateInteractiveContent(
  interactive: any,
  interactiveId: string
): Promise<MultimediaContent> {
  // Create a screenshot or preview of the interactive content
  const previewSrc = `/images/interactive-previews/${interactiveId}-preview.jpg`;

  return {
    id: interactiveId,
    type: "multimedia",
    title: `Interactive ${interactive.type
      .replace(/-/g, " ")
      .replace(/\b\w/g, (l: string) => l.toUpperCase())}`,
    content: {
      mediaType: "image",
      src: previewSrc,
      sources: [
        {
          src: previewSrc,
          type: "image/jpeg",
          quality: "high",
        },
      ],
    },
    metadata: {
      accessibility: {
        altText: `Interactive ${interactive.type} demonstration`,
        keyboardNavigation: true,
        highContrast: true,
      },
      analytics: {
        trackCompletion: false,
        trackInteractions: true,
        trackTimeSpent: true,
      },
      // Store original interactive config for potential restoration
      originalConfig: interactive.config,
    },
  };
}

/**
 * Migrate takeaways to multimedia content (as rich text images or animations)
 */
async function migrateTakeawaysToMultimedia(
  takeaways: Record<string, string>
): Promise<{
  content: MultimediaContent[];
  errors: string[];
  warnings: string[];
}> {
  const content: MultimediaContent[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [takeawayKey, takeawayText] of Object.entries(takeaways)) {
    try {
      // Create a visual representation of the takeaway
      const takeawayImageSrc = `/images/takeaways/${takeawayKey}-takeaway.jpg`;

      const multimediaContent: MultimediaContent = {
        id: `takeaway-${takeawayKey}`,
        type: "multimedia",
        title: `Key Takeaway: ${takeawayKey
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (str) => str.toUpperCase())}`,
        content: {
          mediaType: "image",
          src: takeawayImageSrc,
          sources: [
            {
              src: takeawayImageSrc,
              type: "image/jpeg",
              quality: "high",
            },
          ],
        },
        metadata: {
          accessibility: {
            altText: `Key takeaway illustration for ${takeawayKey}`,
            keyboardNavigation: true,
            highContrast: true,
          },
          analytics: {
            trackCompletion: false,
            trackInteractions: true,
            trackTimeSpent: true,
          },
          // Store original takeaway text
          originalText: takeawayText,
        },
      };

      content.push(multimediaContent);
    } catch (error) {
      errors.push(
        `Failed to migrate takeaway ${takeawayKey}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  return { content, errors, warnings };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Generate alt text for icons based on their names
 */
function generateIconAltText(iconName: string): string {
  const iconDescriptions: Record<string, string> = {
    "arrow-up": "Upward arrow indicating progression or improvement",
    transformer: "Neural network transformer architecture diagram",
    concepts: "Conceptual framework illustration",
    prompting: "Prompt engineering and optimization icon",
    expert: "Expert-level knowledge and documentation",
    safer: "Safety and security framework shield",
    toolkit: "Medical AI toolkit and resources",
    workflow: "Clinical workflow and process diagram",
    video: "Video content and multimedia learning",
    award: "Achievement and certification badge",
    users: "Healthcare team and collaboration",
    "book-open": "Educational content and learning materials",
    briefcase: "Professional tools and resources",
    microphone: "Audio content and voice interaction",
    globe: "Global healthcare and connectivity",
  };

  return (
    iconDescriptions[iconName] ||
    `${iconName.replace(/-/g, " ")} icon for educational content`
  );
}

/**
 * Detect image type from file extension
 */
function detectImageType(src: string): string {
  const extension = src.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "gif":
      return "image/gif";
    default:
      return "image/jpeg"; // Default fallback
  }
}

/**
 * Generate WebVTT captions from transcript text
 */
function generateVTTFromTranscript(transcript: string): string {
  const sentences = transcript.split(/[.!?]+/).filter((s) => s.trim());
  let vttContent = "WEBVTT\n\n";

  sentences.forEach((sentence, index) => {
    const startTime = index * 3; // 3 seconds per sentence
    const endTime = (index + 1) * 3;

    vttContent += `${index + 1}\n`;
    vttContent += `${formatVTTTime(startTime)} --> ${formatVTTTime(endTime)}\n`;
    vttContent += `${sentence.trim()}\n\n`;
  });

  return `data:text/vtt;charset=utf-8,${encodeURIComponent(vttContent)}`;
}

/**
 * Format time for WebVTT (HH:MM:SS.mmm)
 */
function formatVTTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${milliseconds
    .toString()
    .padStart(3, "0")}`;
}

/**
 * Validate migrated multimedia content
 */
export function validateMigratedMultimedia(content: MultimediaContent[]): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  content.forEach((item, index) => {
    // Check required fields
    if (!item.id) {
      errors.push(`Item ${index}: Missing required ID`);
    }

    if (!item.content.src) {
      errors.push(`Item ${index}: Missing media source`);
    }

    if (!item.metadata?.accessibility?.altText) {
      warnings.push(`Item ${index}: Missing alt text for accessibility`);
    }

    // Check media type specific requirements
    if (item.content.mediaType === "video") {
      if (!item.content.transcript && !item.content.captions?.length) {
        warnings.push(
          `Item ${index}: Video content should have captions or transcript for accessibility`
        );
      }
    }

    if (item.content.mediaType === "audio") {
      if (!item.content.transcript) {
        warnings.push(
          `Item ${index}: Audio content should have transcript for accessibility`
        );
      }
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Generate migration report
 */
export function generateMigrationReport(
  originalCount: number,
  migratedContent: MultimediaContent[],
  errors: string[],
  warnings: string[]
): string {
  const successCount = migratedContent.length;
  const successRate =
    originalCount > 0 ? (successCount / originalCount) * 100 : 0;

  let report = "# AI for MD Multimedia Migration Report\n\n";
  report += `## Summary\n`;
  report += `- Original items: ${originalCount}\n`;
  report += `- Successfully migrated: ${successCount}\n`;
  report += `- Success rate: ${successRate.toFixed(1)}%\n`;
  report += `- Errors: ${errors.length}\n`;
  report += `- Warnings: ${warnings.length}\n\n`;

  if (errors.length > 0) {
    report += `## Errors\n`;
    errors.forEach((error, index) => {
      report += `${index + 1}. ${error}\n`;
    });
    report += `\n`;
  }

  if (warnings.length > 0) {
    report += `## Warnings\n`;
    warnings.forEach((warning, index) => {
      report += `${index + 1}. ${warning}\n`;
    });
    report += `\n`;
  }

  report += `## Migrated Content\n`;
  migratedContent.forEach((item, index) => {
    report += `${index + 1}. **${item.title}** (${item.content.mediaType})\n`;
    report += `   - ID: ${item.id}\n`;
    report += `   - Source: ${item.content.src}\n`;
    if (item.metadata?.accessibility?.altText) {
      report += `   - Alt Text: ${item.metadata.accessibility.altText}\n`;
    }
    report += `\n`;
  });

  return report;
}

// =============================================================================
// EXPORT MIGRATION FUNCTIONS
// =============================================================================

export {
  migrateAIForMDMultimedia,
  validateMigratedMultimedia,
  generateMigrationReport,
};
