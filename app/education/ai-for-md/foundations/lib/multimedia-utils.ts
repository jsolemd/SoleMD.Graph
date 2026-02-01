/**
 * @fileoverview Multimedia Integration Utilities
 * @description Comprehensive utilities for handling multimedia content in education modules
 * including optimization, accessibility, and responsive loading patterns
 */

import { MultimediaContent, Caption, MediaSource } from "./content-types";

// =============================================================================
// MEDIA OPTIMIZATION UTILITIES
// =============================================================================

/**
 * Media quality settings for different use cases
 */
export interface MediaQualitySettings {
  video: {
    low: { width: 480; height: 270; bitrate: 500 };
    medium: { width: 720; height: 405; bitrate: 1000 };
    high: { width: 1080; height: 607; bitrate: 2000 };
    ultra: { width: 1440; height: 810; bitrate: 4000 };
  };
  audio: {
    low: { bitrate: 64; sampleRate: 22050 };
    medium: { bitrate: 128; sampleRate: 44100 };
    high: { bitrate: 192; sampleRate: 44100 };
    ultra: { bitrate: 320; sampleRate: 48000 };
  };
  image: {
    thumbnail: { width: 150; height: 150; quality: 60 };
    small: { width: 400; height: 300; quality: 75 };
    medium: { width: 800; height: 600; quality: 85 };
    large: { width: 1200; height: 900; quality: 90 };
    original: { quality: 95 };
  };
}

/**
 * Generate responsive image sources for different screen sizes
 */
export function generateResponsiveImageSources(
  baseSrc: string,
  sizes: Array<{ width: number; suffix?: string }>
): MediaSource[] {
  return sizes.map((size) => {
    const suffix = size.suffix || `_${size.width}w`;
    const src = baseSrc.replace(/(\.[^.]+)$/, `${suffix}$1`);
    return {
      src,
      type: "image/webp", // Prefer WebP for better compression
      quality:
        size.width <= 400 ? "small" : size.width <= 800 ? "medium" : "large",
    };
  });
}

/**
 * Generate video sources for different qualities and formats
 */
export function generateVideoSources(
  baseSrc: string,
  qualities: Array<keyof MediaQualitySettings["video"]> = ["medium", "high"]
): MediaSource[] {
  const sources: MediaSource[] = [];

  qualities.forEach((quality) => {
    // WebM format (preferred for web)
    sources.push({
      src: baseSrc.replace(/(\.[^.]+)$/, `_${quality}.webm`),
      type: "video/webm",
      quality,
    });

    // MP4 format (fallback)
    sources.push({
      src: baseSrc.replace(/(\.[^.]+)$/, `_${quality}.mp4`),
      type: "video/mp4",
      quality,
    });
  });

  return sources;
}

/**
 * Generate audio sources for different qualities and formats
 */
export function generateAudioSources(
  baseSrc: string,
  qualities: Array<keyof MediaQualitySettings["audio"]> = ["medium", "high"]
): MediaSource[] {
  const sources: MediaSource[] = [];

  qualities.forEach((quality) => {
    // WebM audio format (preferred)
    sources.push({
      src: baseSrc.replace(/(\.[^.]+)$/, `_${quality}.webm`),
      type: "audio/webm",
      quality,
    });

    // MP3 format (fallback)
    sources.push({
      src: baseSrc.replace(/(\.[^.]+)$/, `_${quality}.mp3`),
      type: "audio/mpeg",
      quality,
    });
  });

  return sources;
}

// =============================================================================
// ACCESSIBILITY UTILITIES
// =============================================================================

/**
 * Generate captions from transcript text
 */
export function generateCaptionsFromTranscript(
  transcript: string,
  language = "en",
  segmentDuration = 3
): Caption[] {
  const sentences = transcript.split(/[.!?]+/).filter((s) => s.trim());
  const captions: Caption[] = [];

  sentences.forEach((sentence, index) => {
    const startTime = index * segmentDuration;
    const endTime = (index + 1) * segmentDuration;

    captions.push({
      language,
      src: `data:text/vtt;charset=utf-8,WEBVTT\n\n${String(index + 1).padStart(
        2,
        "0"
      )}\n${formatTime(startTime)} --> ${formatTime(
        endTime
      )}\n${sentence.trim()}`,
      label: `${language.toUpperCase()} Captions`,
      default: language === "en",
    });
  });

  return captions;
}

/**
 * Format time for WebVTT captions (HH:MM:SS.mmm)
 */
function formatTime(seconds: number): string {
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
 * Generate alt text for educational images using AI-friendly patterns
 */
export function generateEducationalAltText(
  imageType: "diagram" | "chart" | "photo" | "screenshot" | "illustration",
  context: string,
  details?: string[]
): string {
  const baseText = `Educational ${imageType} showing ${context}`;

  if (details && details.length > 0) {
    return `${baseText}. Key elements include: ${details.join(", ")}.`;
  }

  return `${baseText}.`;
}

/**
 * Validate accessibility compliance for multimedia content
 */
export function validateAccessibility(content: MultimediaContent): {
  isCompliant: boolean;
  issues: string[];
  recommendations: string[];
} {
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check for alt text on images
  if (content.content.mediaType === "image") {
    if (!content.metadata?.accessibility?.altText) {
      issues.push("Missing alt text for image");
      recommendations.push(
        "Add descriptive alt text that explains the educational content of the image"
      );
    }
  }

  // Check for captions on video
  if (content.content.mediaType === "video") {
    if (!content.content.captions || content.content.captions.length === 0) {
      issues.push("Missing captions for video content");
      recommendations.push(
        "Add captions in at least the primary language (English)"
      );
    }

    if (!content.content.transcript) {
      issues.push("Missing transcript for video content");
      recommendations.push("Provide a full transcript for screen reader users");
    }
  }

  // Check for transcripts on audio
  if (content.content.mediaType === "audio") {
    if (!content.content.transcript) {
      issues.push("Missing transcript for audio content");
      recommendations.push(
        "Provide a full transcript for hearing-impaired users"
      );
    }
  }

  // Check for keyboard navigation support
  if (!content.metadata?.accessibility?.keyboardNavigation) {
    recommendations.push(
      "Ensure all interactive elements are keyboard accessible"
    );
  }

  return {
    isCompliant: issues.length === 0,
    issues,
    recommendations,
  };
}

// =============================================================================
// PERFORMANCE OPTIMIZATION
// =============================================================================

/**
 * Progressive loading strategy for multimedia content
 */
export interface ProgressiveLoadingStrategy {
  /** Load thumbnail/preview first */
  preload: "thumbnail" | "metadata" | "none";
  /** Lazy load full content when in viewport */
  lazyLoad: boolean;
  /** Intersection observer threshold for lazy loading */
  threshold: number;
  /** Preload next content in sequence */
  preloadNext: boolean;
}

/**
 * Default progressive loading strategies by content type
 */
export const DEFAULT_LOADING_STRATEGIES: Record<
  string,
  ProgressiveLoadingStrategy
> = {
  image: {
    preload: "thumbnail",
    lazyLoad: true,
    threshold: 0.1,
    preloadNext: false,
  },
  video: {
    preload: "metadata",
    lazyLoad: true,
    threshold: 0.25,
    preloadNext: false,
  },
  audio: {
    preload: "metadata",
    lazyLoad: true,
    threshold: 0.5,
    preloadNext: true,
  },
};

/**
 * Calculate optimal media quality based on connection and device
 */
export function calculateOptimalQuality(
  mediaType: "video" | "audio" | "image",
  connectionSpeed?: "slow" | "medium" | "fast",
  deviceType?: "mobile" | "tablet" | "desktop"
): string {
  // Default to medium quality
  let quality = "medium";

  // Adjust based on connection speed
  if (connectionSpeed === "slow") {
    quality = "low";
  } else if (connectionSpeed === "fast") {
    quality = "high";
  }

  // Adjust based on device type
  if (deviceType === "mobile" && quality === "high") {
    quality = "medium"; // Reduce quality on mobile to save bandwidth
  } else if (deviceType === "desktop" && quality === "low") {
    quality = "medium"; // Increase quality on desktop
  }

  return quality;
}

/**
 * Preload critical multimedia resources
 */
export function preloadCriticalMedia(
  mediaSources: MediaSource[]
): Promise<void[]> {
  const preloadPromises = mediaSources.map((source) => {
    return new Promise<void>((resolve, reject) => {
      if (source.type.startsWith("image/")) {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () =>
          reject(new Error(`Failed to preload image: ${source.src}`));
        img.src = source.src;
      } else if (source.type.startsWith("video/")) {
        const video = document.createElement("video");
        video.onloadedmetadata = () => resolve();
        video.onerror = () =>
          reject(new Error(`Failed to preload video: ${source.src}`));
        video.preload = "metadata";
        video.src = source.src;
      } else if (source.type.startsWith("audio/")) {
        const audio = new Audio();
        audio.onloadedmetadata = () => resolve();
        audio.onerror = () =>
          reject(new Error(`Failed to preload audio: ${source.src}`));
        audio.preload = "metadata";
        audio.src = source.src;
      } else {
        resolve(); // Unknown type, skip
      }
    });
  });

  return Promise.all(preloadPromises);
}

// =============================================================================
// CONTENT TRANSFORMATION UTILITIES
// =============================================================================

/**
 * Transform legacy multimedia content to new format
 */
export function transformLegacyMultimedia(
  legacyContent: any
): MultimediaContent {
  const mediaType = detectMediaType(legacyContent);

  const transformedContent: MultimediaContent = {
    id: legacyContent.id || generateId(),
    type: "multimedia",
    title: legacyContent.title || `${mediaType} Content`,
    content: {
      mediaType,
      src: legacyContent.url || legacyContent.src,
      sources: generateMediaSources(legacyContent, mediaType),
      captions: transformCaptions(legacyContent.captions),
      transcript: legacyContent.transcript,
    },
    metadata: {
      estimatedDuration: legacyContent.duration,
      accessibility: {
        altText: legacyContent.altText || legacyContent.description,
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

  return transformedContent;
}

/**
 * Detect media type from legacy content
 */
function detectMediaType(
  content: any
): "video" | "audio" | "image" | "animation" {
  if (content.type) return content.type;

  const src = content.url || content.src || "";
  const extension = src.split(".").pop()?.toLowerCase();

  if (["mp4", "webm", "avi", "mov"].includes(extension || "")) return "video";
  if (["mp3", "wav", "ogg", "m4a"].includes(extension || "")) return "audio";
  if (["gif", "svg"].includes(extension || "")) return "animation";
  if (["jpg", "jpeg", "png", "webp"].includes(extension || "")) return "image";

  return "image"; // Default fallback
}

/**
 * Generate media sources from legacy content
 */
function generateMediaSources(content: any, mediaType: string): MediaSource[] {
  const sources: MediaSource[] = [];

  if (content.sources) {
    return content.sources.map((source: any) => ({
      src: source.url || source.src,
      type: source.type || `${mediaType}/*`,
      quality: source.quality || "medium",
    }));
  }

  // Generate default sources based on media type
  const baseSrc = content.url || content.src;
  if (mediaType === "video") {
    return generateVideoSources(baseSrc);
  } else if (mediaType === "audio") {
    return generateAudioSources(baseSrc);
  } else if (mediaType === "image") {
    return generateResponsiveImageSources(baseSrc, [
      { width: 400 },
      { width: 800 },
      { width: 1200 },
    ]);
  }

  return sources;
}

/**
 * Transform legacy captions to new format
 */
function transformCaptions(legacyCaptions: any[]): Caption[] {
  if (!legacyCaptions || !Array.isArray(legacyCaptions)) {
    return [];
  }

  return legacyCaptions.map((caption) => ({
    language: caption.lang || caption.language || "en",
    src: caption.url || caption.src,
    label: caption.label || `${(caption.lang || "en").toUpperCase()} Captions`,
    default: caption.default || false,
  }));
}

/**
 * Generate unique ID for content
 */
function generateId(): string {
  return `multimedia-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// =============================================================================
// ANALYTICS AND TRACKING
// =============================================================================

/**
 * Track multimedia interaction events
 */
export interface MultimediaAnalytics {
  contentId: string;
  mediaType: "video" | "audio" | "image" | "animation";
  events: MultimediaEvent[];
}

export interface MultimediaEvent {
  type:
    | "play"
    | "pause"
    | "seek"
    | "complete"
    | "error"
    | "quality_change"
    | "caption_toggle";
  timestamp: Date;
  data?: Record<string, any>;
}

/**
 * Multimedia analytics tracker
 */
export class MultimediaTracker {
  private analytics: Map<string, MultimediaAnalytics> = new Map();

  /**
   * Track multimedia event
   */
  trackEvent(
    contentId: string,
    mediaType: string,
    event: Omit<MultimediaEvent, "timestamp">
  ): void {
    if (!this.analytics.has(contentId)) {
      this.analytics.set(contentId, {
        contentId,
        mediaType: mediaType as any,
        events: [],
      });
    }

    const analytics = this.analytics.get(contentId)!;
    analytics.events.push({
      ...event,
      timestamp: new Date(),
    });

    // Store in localStorage for persistence
    this.persistAnalytics(contentId, analytics);
  }

  /**
   * Get analytics for content
   */
  getAnalytics(contentId: string): MultimediaAnalytics | null {
    return this.analytics.get(contentId) || null;
  }

  /**
   * Get engagement metrics
   */
  getEngagementMetrics(contentId: string): {
    totalViews: number;
    completionRate: number;
    averageWatchTime: number;
    interactionCount: number;
  } {
    const analytics = this.getAnalytics(contentId);
    if (!analytics) {
      return {
        totalViews: 0,
        completionRate: 0,
        averageWatchTime: 0,
        interactionCount: 0,
      };
    }

    const playEvents = analytics.events.filter((e) => e.type === "play");
    const completeEvents = analytics.events.filter(
      (e) => e.type === "complete"
    );
    const totalViews = playEvents.length;
    const completionRate =
      totalViews > 0 ? (completeEvents.length / totalViews) * 100 : 0;

    // Calculate average watch time (simplified)
    const watchTimes = analytics.events
      .filter((e) => e.type === "complete" && e.data?.duration)
      .map((e) => e.data!.duration as number);
    const averageWatchTime =
      watchTimes.length > 0
        ? watchTimes.reduce((sum, time) => sum + time, 0) / watchTimes.length
        : 0;

    const interactionCount = analytics.events.filter((e) =>
      ["seek", "quality_change", "caption_toggle"].includes(e.type)
    ).length;

    return {
      totalViews,
      completionRate,
      averageWatchTime,
      interactionCount,
    };
  }

  /**
   * Persist analytics to localStorage
   */
  private persistAnalytics(
    contentId: string,
    analytics: MultimediaAnalytics
  ): void {
    try {
      const key = `multimedia-analytics-${contentId}`;
      localStorage.setItem(key, JSON.stringify(analytics));
    } catch (error) {
      console.warn("Failed to persist multimedia analytics:", error);
    }
  }

  /**
   * Load analytics from localStorage
   */
  loadPersistedAnalytics(contentId: string): void {
    try {
      const key = `multimedia-analytics-${contentId}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        const analytics = JSON.parse(stored);
        this.analytics.set(contentId, analytics);
      }
    } catch (error) {
      console.warn("Failed to load persisted multimedia analytics:", error);
    }
  }
}

// Create default tracker instance
export const multimediaTracker = new MultimediaTracker();

// =============================================================================
// EXPORT UTILITIES
// =============================================================================

export { MediaQualitySettings, ProgressiveLoadingStrategy };
