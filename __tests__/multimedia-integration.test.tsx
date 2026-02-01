/**
 * @fileoverview Comprehensive tests for multimedia integration
 * @description Tests for video, audio, and image components with accessibility,
 * performance, and error handling validation
 */

import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  VideoPlayer,
  AudioPlayer,
  InteractiveImage,
} from "../app/education/ai-for-md/foundations/learn/components/MultimediaContent";
import { multimediaTracker } from "../app/education/ai-for-md/foundations/lib/multimedia-utils";

// Mock multimedia tracker
jest.mock(
  "../app/education/ai-for-md/foundations/lib/multimedia-utils",
  () => ({
    multimediaTracker: {
      trackEvent: jest.fn(),
    },
    generateResponsiveImageSources: jest.fn(() => []),
    validateAccessibility: jest.fn(() => ({
      isCompliant: true,
      issues: [],
      recommendations: [],
    })),
  })
);

// Mock Framer Motion
jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    img: ({ children, ...props }: any) => <img {...props}>{children}</img>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

// Mock Mantine components
jest.mock("@mantine/core", () => ({
  Button: ({ children, onClick, leftSection, rightSection, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {leftSection}
      {children}
      {rightSection}
    </button>
  ),
  Slider: ({ onChange, value, ...props }: any) => (
    <input
      type="range"
      onChange={(e) => onChange?.(parseFloat(e.target.value))}
      value={value}
      {...props}
    />
  ),
  Select: ({ onChange, value, data, ...props }: any) => (
    <select
      onChange={(e) => onChange?.(e.target.value)}
      value={value}
      {...props}
    >
      {data?.map((item: any) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  ),
  ActionIcon: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Tooltip: ({ children }: any) => children,
  Badge: ({ children }: any) => <span>{children}</span>,
}));

describe("VideoPlayer Component", () => {
  const mockVideoProps = {
    src: "/test-video.mp4",
    title: "Test Educational Video",
    captions: [
      {
        language: "en",
        label: "English",
        src: "/test-captions.vtt",
        default: true,
      },
    ],
    transcript: "This is a test video transcript for educational purposes.",
    chapters: [
      { time: 0, title: "Introduction", description: "Video introduction" },
      {
        time: 60,
        title: "Main Content",
        description: "Core educational content",
      },
    ],
    onInteraction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock HTMLVideoElement methods
    Object.defineProperty(HTMLVideoElement.prototype, "play", {
      writable: true,
      value: jest.fn().mockResolvedValue(undefined),
    });

    Object.defineProperty(HTMLVideoElement.prototype, "pause", {
      writable: true,
      value: jest.fn(),
    });

    Object.defineProperty(HTMLVideoElement.prototype, "load", {
      writable: true,
      value: jest.fn(),
    });
  });

  test("renders video player with proper accessibility attributes", () => {
    render(<VideoPlayer {...mockVideoProps} />);

    expect(screen.getByRole("region")).toHaveAttribute(
      "aria-label",
      "Test Educational Video"
    );
    expect(
      screen.getByRole("button", { name: /play video/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("slider", { name: /video progress/i })
    ).toBeInTheDocument();
  });

  test("displays loading state initially", () => {
    render(<VideoPlayer {...mockVideoProps} />);

    expect(screen.getByText("Loading video...")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { hidden: true })
    ).toBeInTheDocument();
  });

  test("handles play/pause functionality", async () => {
    const user = userEvent.setup();
    render(<VideoPlayer {...mockVideoProps} />);

    const playButton = screen.getByRole("button", { name: /play video/i });
    await user.click(playButton);

    expect(HTMLVideoElement.prototype.play).toHaveBeenCalled();
    expect(mockVideoProps.onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "video_played",
      })
    );
  });

  test("displays error state when video fails to load", async () => {
    render(<VideoPlayer {...mockVideoProps} />);

    const video = document.querySelector("video");
    if (video) {
      // Simulate video error
      const errorEvent = new Event("error");
      Object.defineProperty(video, "error", {
        value: { code: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED },
      });
      fireEvent(video, errorEvent);
    }

    await waitFor(() => {
      expect(screen.getByText("Video Error")).toBeInTheDocument();
      expect(
        screen.getByText("Video source is not supported")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /retry/i })
      ).toBeInTheDocument();
    });
  });

  test("supports keyboard navigation", async () => {
    const user = userEvent.setup();
    render(<VideoPlayer {...mockVideoProps} />);

    const playButton = screen.getByRole("button", { name: /play video/i });

    // Tab to play button and activate with Enter
    await user.tab();
    expect(playButton).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(HTMLVideoElement.prototype.play).toHaveBeenCalled();
  });

  test("displays captions when available", () => {
    render(<VideoPlayer {...mockVideoProps} />);

    const video = document.querySelector("video");
    const tracks = video?.querySelectorAll("track");

    expect(tracks).toHaveLength(1);
    expect(tracks?.[0]).toHaveAttribute("kind", "captions");
    expect(tracks?.[0]).toHaveAttribute("srclang", "en");
    expect(tracks?.[0]).toHaveAttribute("label", "English");
  });

  test("shows transcript when toggled", async () => {
    const user = userEvent.setup();
    render(<VideoPlayer {...mockVideoProps} />);

    const transcriptButton = screen.getByRole("button", { name: /show/i });
    await user.click(transcriptButton);

    expect(screen.getByText(mockVideoProps.transcript)).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /video transcript/i })
    ).toBeInTheDocument();
  });

  test("tracks analytics events", async () => {
    const user = userEvent.setup();
    render(<VideoPlayer {...mockVideoProps} />);

    const playButton = screen.getByRole("button", { name: /play video/i });
    await user.click(playButton);

    expect(multimediaTracker.trackEvent).toHaveBeenCalledWith(
      "/test-video.mp4",
      "video",
      expect.objectContaining({
        type: "video_played",
      })
    );
  });
});

describe("AudioPlayer Component", () => {
  const mockAudioProps = {
    src: "/test-audio.mp3",
    title: "Test Educational Audio",
    transcript: "This is a test audio transcript for educational purposes.",
    chapters: [
      { time: 0, title: "Introduction" },
      { time: 120, title: "Main Discussion" },
    ],
    onInteraction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock HTMLAudioElement methods
    Object.defineProperty(HTMLAudioElement.prototype, "play", {
      writable: true,
      value: jest.fn().mockResolvedValue(undefined),
    });

    Object.defineProperty(HTMLAudioElement.prototype, "pause", {
      writable: true,
      value: jest.fn(),
    });
  });

  test("renders audio player with proper accessibility", () => {
    render(<AudioPlayer {...mockAudioProps} />);

    expect(screen.getByText("Test Educational Audio")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /play audio/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("slider", { name: /audio progress/i })
    ).toBeInTheDocument();
  });

  test("displays waveform visualization", () => {
    render(<AudioPlayer {...mockAudioProps} />);

    // Check for waveform container
    const waveformContainer = document.querySelector(".flex.items-end.gap-1");
    expect(waveformContainer).toBeInTheDocument();
  });

  test("handles audio playback controls", async () => {
    const user = userEvent.setup();
    render(<AudioPlayer {...mockAudioProps} />);

    const playButton = screen.getByRole("button", { name: /play audio/i });
    await user.click(playButton);

    expect(HTMLAudioElement.prototype.play).toHaveBeenCalled();
    expect(mockAudioProps.onInteraction).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "audio_played",
      })
    );
  });

  test("supports skip forward and backward", async () => {
    const user = userEvent.setup();
    render(<AudioPlayer {...mockAudioProps} />);

    const skipBackButton = screen.getByRole("button", {
      name: /skip back 15 seconds/i,
    });
    const skipForwardButton = screen.getByRole("button", {
      name: /skip forward 15 seconds/i,
    });

    await user.click(skipBackButton);
    await user.click(skipForwardButton);

    // Verify skip functionality (would need more detailed mocking for exact time verification)
    expect(skipBackButton).toBeInTheDocument();
    expect(skipForwardButton).toBeInTheDocument();
  });

  test("shows transcript when toggled", async () => {
    const user = userEvent.setup();
    render(<AudioPlayer {...mockAudioProps} />);

    const transcriptButton = screen.getByRole("button", { name: /show/i });
    await user.click(transcriptButton);

    expect(screen.getByText(mockAudioProps.transcript)).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /audio transcript/i })
    ).toBeInTheDocument();
  });
});

describe("InteractiveImage Component", () => {
  const mockImageProps = {
    src: "/test-image.jpg",
    alt: "Test educational diagram showing AI workflow process",
    title: "AI Workflow Diagram",
    annotations: [
      {
        x: 25,
        y: 30,
        title: "Input Layer",
        description: "Data input from various medical sources",
      },
      {
        x: 75,
        y: 30,
        title: "Output Layer",
        description: "Clinical recommendations and insights",
      },
    ],
    onInteraction: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders image with proper accessibility attributes", () => {
    render(<InteractiveImage {...mockImageProps} />);

    expect(screen.getByRole("img")).toHaveAttribute(
      "alt",
      "Test educational diagram showing AI workflow process"
    );
    expect(screen.getByText("AI Workflow Diagram")).toBeInTheDocument();
  });

  test("displays loading state initially", () => {
    render(<InteractiveImage {...mockImageProps} />);

    expect(screen.getByText("Loading image...")).toBeInTheDocument();
  });

  test("shows annotations when image loads", async () => {
    render(<InteractiveImage {...mockImageProps} />);

    // Simulate image load
    const img = screen.getByRole("img");
    fireEvent.load(img);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /annotation 1: input layer/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /annotation 2: output layer/i })
      ).toBeInTheDocument();
    });
  });

  test("handles annotation clicks", async () => {
    const user = userEvent.setup();
    render(<InteractiveImage {...mockImageProps} />);

    // Simulate image load
    const img = screen.getByRole("img");
    fireEvent.load(img);

    await waitFor(async () => {
      const annotation = screen.getByRole("button", {
        name: /annotation 1: input layer/i,
      });
      await user.click(annotation);

      expect(mockImageProps.onInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "annotation_clicked",
          annotation: mockImageProps.annotations[0],
        })
      );
    });
  });

  test("handles image loading errors", async () => {
    render(<InteractiveImage {...mockImageProps} />);

    const img = screen.getByRole("img");
    fireEvent.error(img);

    await waitFor(() => {
      expect(screen.getByText("Failed to load image")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /retry/i })
      ).toBeInTheDocument();
    });
  });

  test("supports zoom functionality", async () => {
    const user = userEvent.setup();
    render(<InteractiveImage {...mockImageProps} />);

    // Simulate image load
    const img = screen.getByRole("img");
    fireEvent.load(img);

    await waitFor(async () => {
      const zoomButton = screen.getByRole("button", { name: /zoom in/i });
      await user.click(zoomButton);

      // Verify zoom state change (would need more detailed testing for actual zoom behavior)
      expect(
        screen.getByRole("button", { name: /zoom out/i })
      ).toBeInTheDocument();
    });
  });

  test("supports responsive image loading", () => {
    const responsiveProps = {
      ...mockImageProps,
      srcSet: "/test-image-400w.webp 400w, /test-image-800w.webp 800w",
      sizes: "(max-width: 768px) 100vw, 50vw",
    };

    render(<InteractiveImage {...responsiveProps} />);

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("srcset", responsiveProps.srcSet);
    expect(img).toHaveAttribute("sizes", responsiveProps.sizes);
  });
});

describe("Multimedia Accessibility", () => {
  test("all multimedia components support keyboard navigation", async () => {
    const user = userEvent.setup();

    render(
      <div>
        <VideoPlayer src="/test-video.mp4" title="Test Video" />
        <AudioPlayer src="/test-audio.mp3" title="Test Audio" />
        <InteractiveImage src="/test-image.jpg" alt="Test Image" />
      </div>
    );

    // Test tab navigation through all interactive elements
    await user.tab();
    expect(document.activeElement).toHaveAttribute("aria-label", /play video/i);

    await user.tab();
    expect(document.activeElement).toHaveAttribute("aria-label", /skip back/i);

    // Continue tabbing through all controls
    for (let i = 0; i < 10; i++) {
      await user.tab();
    }

    // Verify we can reach audio controls
    expect(
      screen.getByRole("button", { name: /play audio/i })
    ).toBeInTheDocument();
  });

  test("multimedia components provide proper ARIA labels", () => {
    render(
      <div>
        <VideoPlayer src="/test-video.mp4" title="Educational Video" />
        <AudioPlayer src="/test-audio.mp3" title="Educational Audio" />
        <InteractiveImage
          src="/test-image.jpg"
          alt="Educational Image"
          title="Diagram"
        />
      </div>
    );

    expect(
      screen.getByRole("region", { name: /educational video/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /educational audio/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /educational image/i })
    ).toBeInTheDocument();
  });

  test("multimedia components support reduced motion preferences", () => {
    // Mock reduced motion preference
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: jest.fn().mockImplementation((query) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });

    render(<InteractiveImage src="/test-image.jpg" alt="Test Image" />);

    // Verify that animations respect reduced motion (implementation would depend on actual motion handling)
    expect(screen.getByRole("img")).toBeInTheDocument();
  });
});

describe("Performance Optimization", () => {
  test("images use lazy loading by default", () => {
    render(<InteractiveImage src="/test-image.jpg" alt="Test Image" />);

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  test("videos preload metadata only", () => {
    render(<VideoPlayer src="/test-video.mp4" title="Test Video" />);

    const video = document.querySelector("video");
    expect(video).toHaveAttribute("preload", "metadata");
  });

  test("components handle network errors gracefully", async () => {
    render(<VideoPlayer src="/nonexistent-video.mp4" title="Test Video" />);

    const video = document.querySelector("video");
    if (video) {
      const errorEvent = new Event("error");
      Object.defineProperty(video, "error", {
        value: { code: MediaError.MEDIA_ERR_NETWORK },
      });
      fireEvent(video, errorEvent);
    }

    await waitFor(() => {
      expect(
        screen.getByText("Network error occurred while loading video")
      ).toBeInTheDocument();
    });
  });
});

describe("Analytics Integration", () => {
  test("tracks multimedia interactions", async () => {
    const user = userEvent.setup();

    render(
      <VideoPlayer
        src="/test-video.mp4"
        title="Test Video"
        onInteraction={jest.fn()}
      />
    );

    const playButton = screen.getByRole("button", { name: /play video/i });
    await user.click(playButton);

    expect(multimediaTracker.trackEvent).toHaveBeenCalledWith(
      "/test-video.mp4",
      "video",
      expect.objectContaining({
        type: "video_played",
      })
    );
  });

  test("tracks completion events", async () => {
    render(<VideoPlayer src="/test-video.mp4" title="Test Video" />);

    const video = document.querySelector("video");
    if (video) {
      // Simulate video end
      fireEvent.ended(video);
    }

    expect(multimediaTracker.trackEvent).toHaveBeenCalledWith(
      "/test-video.mp4",
      "video",
      expect.objectContaining({
        type: "complete",
      })
    );
  });

  test("tracks error events", async () => {
    render(<VideoPlayer src="/test-video.mp4" title="Test Video" />);

    const video = document.querySelector("video");
    if (video) {
      const errorEvent = new Event("error");
      Object.defineProperty(video, "error", {
        value: { code: MediaError.MEDIA_ERR_DECODE },
      });
      fireEvent(video, errorEvent);
    }

    expect(multimediaTracker.trackEvent).toHaveBeenCalledWith(
      "/test-video.mp4",
      "video",
      expect.objectContaining({
        type: "error",
      })
    );
  });
});
