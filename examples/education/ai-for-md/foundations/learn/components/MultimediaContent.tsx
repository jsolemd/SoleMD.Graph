// @ts-nocheck
"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  SkipBack,
  SkipForward,
  RotateCcw,
  Download,
  FileText,
  Eye,
  EyeOff,
  Captions,
  Settings,
  Image as ImageIcon,
  Video,
  Headphones,
  ZoomIn,
  ZoomOut,
  Move,
  MoreHorizontal,
  AlertCircle,
  RefreshCw,
  Loader,
} from "lucide-react";
import {
  Button,
  Slider,
  Select,
  Badge,
  Tooltip,
  ActionIcon,
} from "@mantine/core";

// Import design patterns
import {
  EducationColors,
  AnimationPatterns,
  TypographyClasses,
  AccessibilityPatterns,
} from "../../lib/design-patterns";

// Import multimedia utilities
import {
  multimediaTracker,
  generateResponsiveImageSources,
  validateAccessibility,
} from "../../lib/multimedia-utils";

/**
 * Enhanced Video Player Component
 * Includes accessibility features, captions, and interactive elements
 */
interface VideoPlayerProps {
  src: string;
  title?: string;
  captions?: Array<{
    language: string;
    label: string;
    src: string;
    default?: boolean;
  }>;
  transcript?: string;
  chapters?: Array<{
    time: number;
    title: string;
    description?: string;
  }>;
  onInteraction?: (data: any) => void;
  className?: string;
}

export function VideoPlayer({
  src,
  title = "Educational Video",
  captions = [],
  transcript,
  chapters = [],
  onInteraction,
  className = "",
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Video control handlers
  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);

      onInteraction?.({
        type: isPlaying ? "video_paused" : "video_played",
        currentTime,
        timestamp: new Date(),
      });
    }
  }, [isPlaying, currentTime, onInteraction]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);

      // Update current chapter
      const chapterIndex = chapters.findIndex((chapter, index) => {
        const nextChapter = chapters[index + 1];
        return (
          time >= chapter.time && (!nextChapter || time < nextChapter.time)
        );
      });
      if (chapterIndex !== -1 && chapterIndex !== currentChapter) {
        setCurrentChapter(chapterIndex);
      }
    }
  }, [chapters, currentChapter]);

  const handleSeek = useCallback(
    (time: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = time;
        setCurrentTime(time);

        onInteraction?.({
          type: "video_seeked",
          seekTime: time,
          timestamp: new Date(),
        });
      }
    },
    [onInteraction]
  );

  const handleVolumeChange = useCallback((newVolume: number) => {
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      setVolume(newVolume);
      setIsMuted(newVolume === 0);
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      const newMuted = !isMuted;
      videoRef.current.muted = newMuted;
      setIsMuted(newMuted);
    }
  }, [isMuted]);

  const changePlaybackRate = useCallback(
    (rate: number) => {
      if (videoRef.current) {
        videoRef.current.playbackRate = rate;
        setPlaybackRate(rate);

        onInteraction?.({
          type: "playback_rate_changed",
          rate,
          timestamp: new Date(),
        });
      }
    },
    [onInteraction]
  );

  const skipTime = useCallback(
    (seconds: number) => {
      if (videoRef.current) {
        const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
        handleSeek(newTime);
      }
    },
    [currentTime, duration, handleSeek]
  );

  const jumpToChapter = useCallback(
    (chapterIndex: number) => {
      if (chapters[chapterIndex]) {
        handleSeek(chapters[chapterIndex].time);
        setCurrentChapter(chapterIndex);
      }
    },
    [chapters, handleSeek]
  );

  const formatTime = useCallback((time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      const handleLoadedMetadata = () => {
        setDuration(video.duration);
        setIsLoading(false);
        setLoadingProgress(100);

        // Track video loaded event
        multimediaTracker.trackEvent(src, "video", {
          type: "loaded",
          data: { duration: video.duration, title },
        });
      };

      const handleLoadStart = () => {
        setIsLoading(true);
        setHasError(false);
        setLoadingProgress(0);
      };

      const handleProgress = () => {
        if (video.buffered.length > 0) {
          const bufferedEnd = video.buffered.end(video.buffered.length - 1);
          const progress = (bufferedEnd / video.duration) * 100;
          setLoadingProgress(progress);
        }
      };

      const handleError = (event: Event) => {
        setIsLoading(false);
        setHasError(true);

        const error = (event.target as HTMLVideoElement).error;
        let message = "Failed to load video";

        if (error) {
          switch (error.code) {
            case MediaError.MEDIA_ERR_ABORTED:
              message = "Video loading was aborted";
              break;
            case MediaError.MEDIA_ERR_NETWORK:
              message = "Network error occurred while loading video";
              break;
            case MediaError.MEDIA_ERR_DECODE:
              message = "Video format is not supported";
              break;
            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
              message = "Video source is not supported";
              break;
          }
        }

        setErrorMessage(message);

        // Track error event
        multimediaTracker.trackEvent(src, "video", {
          type: "error",
          data: { error: message, code: error?.code },
        });
      };

      const handleEnded = () => {
        setIsPlaying(false);
        onInteraction?.({
          type: "video_completed",
          duration: video.duration,
          timestamp: new Date(),
        });

        // Track completion
        multimediaTracker.trackEvent(src, "video", {
          type: "complete",
          data: { duration: video.duration },
        });
      };

      const handleCanPlay = () => {
        setIsLoading(false);
      };

      video.addEventListener("loadstart", handleLoadStart);
      video.addEventListener("loadedmetadata", handleLoadedMetadata);
      video.addEventListener("progress", handleProgress);
      video.addEventListener("canplay", handleCanPlay);
      video.addEventListener("error", handleError);
      video.addEventListener("timeupdate", handleTimeUpdate);
      video.addEventListener("ended", handleEnded);

      return () => {
        video.removeEventListener("loadstart", handleLoadStart);
        video.removeEventListener("loadedmetadata", handleLoadedMetadata);
        video.removeEventListener("progress", handleProgress);
        video.removeEventListener("canplay", handleCanPlay);
        video.removeEventListener("error", handleError);
        video.removeEventListener("timeupdate", handleTimeUpdate);
        video.removeEventListener("ended", handleEnded);
      };
    }
  }, [handleTimeUpdate, onInteraction, src, title]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Video Container */}
      <div
        className="relative rounded-lg overflow-hidden"
        style={{ backgroundColor: "#000" }}
      >
        {/* Loading State */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
            <div className="text-center text-white">
              <Loader className="h-8 w-8 animate-spin mx-auto mb-3" />
              <p className="text-sm mb-2">Loading video...</p>
              {loadingProgress > 0 && (
                <div className="w-48 h-2 bg-gray-600 rounded-full mx-auto">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-300"
                    style={{ width: `${loadingProgress}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error State */}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
            <div className="text-center text-white p-6">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
              <h3 className="text-lg font-semibold mb-2">Video Error</h3>
              <p className="text-sm text-gray-300 mb-4">{errorMessage}</p>
              <Button
                onClick={() => {
                  setHasError(false);
                  setIsLoading(true);
                  if (videoRef.current) {
                    videoRef.current.load();
                  }
                }}
                leftSection={<RefreshCw size={16} />}
                variant="outline"
                className="text-white border-white hover:bg-white/20"
              >
                Retry
              </Button>
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          className="w-full h-auto"
          src={src}
          onClick={togglePlay}
          onDoubleClick={() => setIsFullscreen(!isFullscreen)}
          aria-label={title}
          preload="metadata"
          crossOrigin="anonymous"
        >
          {captions.map((caption) => (
            <track
              key={caption.language}
              kind="captions"
              src={caption.src}
              srcLang={caption.language}
              label={caption.label}
              default={caption.default}
            />
          ))}
          Your browser does not support the video tag.
        </video>

        {/* Video Controls Overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          {/* Progress Bar */}
          <div className="mb-4">
            <Slider
              value={currentTime}
              onChange={handleSeek}
              max={duration}
              size="sm"
              color={EducationColors.primary}
              className="video-progress-slider"
              aria-label="Video progress"
            />
            <div className="flex justify-between text-xs text-white/70 mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="subtle"
                size="sm"
                onClick={togglePlay}
                leftSection={
                  isPlaying ? <Pause size={16} /> : <Play size={16} />
                }
                className="text-white hover:bg-white/20"
                aria-label={isPlaying ? "Pause video" : "Play video"}
              >
                {isPlaying ? "Pause" : "Play"}
              </Button>

              <ActionIcon
                variant="subtle"
                onClick={() => skipTime(-10)}
                className="text-white hover:bg-white/20"
                aria-label="Skip back 10 seconds"
              >
                <SkipBack size={16} />
              </ActionIcon>

              <ActionIcon
                variant="subtle"
                onClick={() => skipTime(10)}
                className="text-white hover:bg-white/20"
                aria-label="Skip forward 10 seconds"
              >
                <SkipForward size={16} />
              </ActionIcon>
            </div>

            <div className="flex items-center gap-2">
              {/* Volume Control */}
              <div className="flex items-center gap-2">
                <ActionIcon
                  variant="subtle"
                  onClick={toggleMute}
                  className="text-white hover:bg-white/20"
                  aria-label={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </ActionIcon>
                <div className="w-20">
                  <Slider
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    max={1}
                    step={0.1}
                    size="xs"
                    color="white"
                    aria-label="Volume"
                  />
                </div>
              </div>

              {/* Playback Speed */}
              <Select
                value={playbackRate.toString()}
                onChange={(value) =>
                  changePlaybackRate(parseFloat(value || "1"))
                }
                data={[
                  { value: "0.5", label: "0.5x" },
                  { value: "0.75", label: "0.75x" },
                  { value: "1", label: "1x" },
                  { value: "1.25", label: "1.25x" },
                  { value: "1.5", label: "1.5x" },
                  { value: "2", label: "2x" },
                ]}
                size="xs"
                className="w-20"
                aria-label="Playback speed"
              />

              {/* Captions Toggle */}
              {captions.length > 0 && (
                <ActionIcon
                  variant="subtle"
                  onClick={() => setShowCaptions(!showCaptions)}
                  className={`text-white hover:bg-white/20 ${
                    showCaptions ? "bg-white/20" : ""
                  }`}
                  aria-label={showCaptions ? "Hide captions" : "Show captions"}
                >
                  <Captions size={16} />
                </ActionIcon>
              )}
            </div>
          </div>
        </div>

        {/* Current Chapter Indicator */}
        {chapters.length > 0 && chapters[currentChapter] && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-4 left-4 bg-black/80 text-white px-3 py-2 rounded-lg"
          >
            <div className="text-sm font-medium">
              {chapters[currentChapter].title}
            </div>
            {chapters[currentChapter].description && (
              <div className="text-xs opacity-70">
                {chapters[currentChapter].description}
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* Chapter Navigation */}
      {chapters.length > 0 && (
        <div
          className="floating-card p-4"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Video size={16} style={{ color: EducationColors.primary }} />
            Chapters
          </h4>
          <div className="space-y-2">
            {chapters.map((chapter, index) => (
              <button
                key={index}
                className={`w-full text-left p-3 rounded-lg border transition-all duration-200 ${
                  index === currentChapter
                    ? "border-2"
                    : "border hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
                style={{
                  borderColor:
                    index === currentChapter
                      ? EducationColors.primary
                      : "var(--border)",
                  backgroundColor:
                    index === currentChapter
                      ? `${EducationColors.primary}10`
                      : "transparent",
                }}
                onClick={() => jumpToChapter(index)}
                aria-label={`Jump to chapter: ${chapter.title}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{chapter.title}</div>
                    {chapter.description && (
                      <div className="text-xs opacity-70 mt-1">
                        {chapter.description}
                      </div>
                    )}
                  </div>
                  <div className="text-xs opacity-70">
                    {formatTime(chapter.time)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Transcript */}
      {transcript && (
        <div
          className="floating-card p-4"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium flex items-center gap-2">
              <FileText size={16} style={{ color: EducationColors.primary }} />
              Transcript
            </h4>
            <Button
              variant="subtle"
              size="xs"
              onClick={() => setShowTranscript(!showTranscript)}
              leftSection={
                showTranscript ? <EyeOff size={14} /> : <Eye size={14} />
              }
              aria-expanded={showTranscript}
              aria-controls="video-transcript"
            >
              {showTranscript ? "Hide" : "Show"}
            </Button>
          </div>
          <AnimatePresence>
            {showTranscript && (
              <motion.div
                id="video-transcript"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="prose prose-sm max-w-none text-flow-natural"
                style={{ color: "var(--foreground)" }}
                role="region"
                aria-label="Video transcript"
              >
                <div className="whitespace-pre-line">{transcript}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/**
 * Enhanced Audio Player Component
 * Includes waveform visualization and accessibility features
 */
interface AudioPlayerProps {
  src: string;
  title?: string;
  transcript?: string;
  chapters?: Array<{
    time: number;
    title: string;
  }>;
  onInteraction?: (data: any) => void;
  className?: string;
}

export function AudioPlayer({
  src,
  title = "Educational Audio",
  transcript,
  chapters = [],
  onInteraction,
  className = "",
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showTranscript, setShowTranscript] = useState(false);

  const togglePlay = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);

      onInteraction?.({
        type: isPlaying ? "audio_paused" : "audio_played",
        currentTime,
        timestamp: new Date(),
      });
    }
  }, [isPlaying, currentTime, onInteraction]);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const handleSeek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const formatTime = useCallback((time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      const handleLoadedMetadata = () => setDuration(audio.duration);
      const handleEnded = () => {
        setIsPlaying(false);
        onInteraction?.({
          type: "audio_completed",
          duration: audio.duration,
          timestamp: new Date(),
        });
      };

      audio.addEventListener("loadedmetadata", handleLoadedMetadata);
      audio.addEventListener("timeupdate", handleTimeUpdate);
      audio.addEventListener("ended", handleEnded);

      return () => {
        audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
        audio.removeEventListener("timeupdate", handleTimeUpdate);
        audio.removeEventListener("ended", handleEnded);
      };
    }
  }, [handleTimeUpdate, onInteraction]);

  return (
    <div className={`space-y-4 ${className}`}>
      <div
        className="floating-card p-6"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        <audio ref={audioRef} src={src} preload="metadata" aria-label={title}>
          Your browser does not support the audio tag.
        </audio>

        {/* Audio Player Header */}
        <div className="flex items-center gap-3 mb-6">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: EducationColors.primary }}
          >
            <Headphones className="h-6 w-6 text-white" />
          </div>
          <div>
            <h3
              className={TypographyClasses.cardTitle}
              style={{ color: "var(--foreground)" }}
            >
              {title}
            </h3>
            <p className="text-sm opacity-70">
              {formatTime(currentTime)} / {formatTime(duration)}
            </p>
          </div>
        </div>

        {/* Waveform Visualization (Simplified) */}
        <div className="mb-6">
          <div className="relative h-16 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
            <div className="flex items-center justify-center h-full">
              <div className="flex items-end gap-1">
                {Array.from({ length: 50 }, (_, i) => {
                  // Create deterministic waveform pattern to avoid hydration mismatch
                  const height =
                    10 + Math.sin(i * 0.3) * 15 + Math.cos(i * 0.7) * 10 + 15;
                  return (
                    <motion.div
                      key={i}
                      className="w-1 bg-gray-300 dark:bg-gray-600 rounded-full"
                      style={{
                        height: `${height}px`,
                        backgroundColor:
                          i / 50 <= currentTime / duration
                            ? EducationColors.primary
                            : undefined,
                      }}
                      animate={{
                        scaleY:
                          isPlaying && i / 50 <= currentTime / duration
                            ? [1, 1.2, 1]
                            : 1,
                      }}
                      transition={{
                        duration: 0.5,
                        repeat: isPlaying ? Infinity : 0,
                        delay: i * 0.05,
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* Progress Overlay */}
            <div className="absolute inset-0">
              <Slider
                value={currentTime}
                onChange={handleSeek}
                max={duration}
                size="lg"
                color={EducationColors.primary}
                className="h-full opacity-0 hover:opacity-100 transition-opacity"
                aria-label="Audio progress"
              />
            </div>
          </div>
        </div>

        {/* Audio Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              size="lg"
              onClick={togglePlay}
              style={{ backgroundColor: EducationColors.primary }}
              leftSection={isPlaying ? <Pause size={20} /> : <Play size={20} />}
              aria-label={isPlaying ? "Pause audio" : "Play audio"}
            >
              {isPlaying ? "Pause" : "Play"}
            </Button>

            <ActionIcon
              variant="subtle"
              size="lg"
              onClick={() => handleSeek(Math.max(0, currentTime - 15))}
              aria-label="Skip back 15 seconds"
            >
              <SkipBack size={20} />
            </ActionIcon>

            <ActionIcon
              variant="subtle"
              size="lg"
              onClick={() => handleSeek(Math.min(duration, currentTime + 15))}
              aria-label="Skip forward 15 seconds"
            >
              <SkipForward size={20} />
            </ActionIcon>
          </div>

          <div className="flex items-center gap-3">
            {/* Volume Control */}
            <div className="flex items-center gap-2">
              <ActionIcon
                variant="subtle"
                onClick={() => setIsMuted(!isMuted)}
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </ActionIcon>
              <div className="w-24">
                <Slider
                  value={isMuted ? 0 : volume}
                  onChange={(value) => {
                    setVolume(value);
                    if (audioRef.current) {
                      audioRef.current.volume = value;
                    }
                    setIsMuted(value === 0);
                  }}
                  max={1}
                  step={0.1}
                  size="sm"
                  color={EducationColors.primary}
                  aria-label="Volume"
                />
              </div>
            </div>

            {/* Playback Speed */}
            <Select
              value={playbackRate.toString()}
              onChange={(value) => {
                const rate = parseFloat(value || "1");
                setPlaybackRate(rate);
                if (audioRef.current) {
                  audioRef.current.playbackRate = rate;
                }
              }}
              data={[
                { value: "0.5", label: "0.5x" },
                { value: "0.75", label: "0.75x" },
                { value: "1", label: "1x" },
                { value: "1.25", label: "1.25x" },
                { value: "1.5", label: "1.5x" },
                { value: "2", label: "2x" },
              ]}
              size="sm"
              className="w-24"
              aria-label="Playback speed"
            />
          </div>
        </div>
      </div>

      {/* Transcript */}
      {transcript && (
        <div
          className="floating-card p-4"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium flex items-center gap-2">
              <FileText size={16} style={{ color: EducationColors.primary }} />
              Transcript
            </h4>
            <Button
              variant="subtle"
              size="xs"
              onClick={() => setShowTranscript(!showTranscript)}
              leftSection={
                showTranscript ? <EyeOff size={14} /> : <Eye size={14} />
              }
              aria-expanded={showTranscript}
              aria-controls="audio-transcript"
            >
              {showTranscript ? "Hide" : "Show"}
            </Button>
          </div>
          <AnimatePresence>
            {showTranscript && (
              <motion.div
                id="audio-transcript"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="prose prose-sm max-w-none text-flow-natural"
                style={{ color: "var(--foreground)" }}
                role="region"
                aria-label="Audio transcript"
              >
                <div className="whitespace-pre-line">{transcript}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/**
 * Interactive Image Component
 * Includes zoom, annotations, accessibility features, and optimized loading
 */
interface InteractiveImageProps {
  src: string;
  alt: string;
  title?: string;
  annotations?: Array<{
    x: number;
    y: number;
    title: string;
    description: string;
  }>;
  onInteraction?: (data: any) => void;
  className?: string;
  /** Optimized loading options */
  loading?: "lazy" | "eager";
  /** Image quality settings */
  quality?: "low" | "medium" | "high";
  /** Responsive image sources */
  srcSet?: string;
  /** Image sizes for responsive loading */
  sizes?: string;
}

export function InteractiveImage({
  src,
  alt,
  title,
  annotations = [],
  onInteraction,
  className = "",
  loading = "lazy",
  quality = "high",
  srcSet,
  sizes,
}: InteractiveImageProps) {
  const [isZoomed, setIsZoomed] = useState(false);
  const [selectedAnnotation, setSelectedAnnotation] = useState<number | null>(
    null
  );
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const handleAnnotationClick = useCallback(
    (index: number) => {
      setSelectedAnnotation(selectedAnnotation === index ? null : index);

      onInteraction?.({
        type: "annotation_clicked",
        annotation: annotations[index],
        timestamp: new Date(),
      });
    },
    [selectedAnnotation, annotations, onInteraction]
  );

  const handleImageLoad = useCallback(() => {
    setImageLoaded(true);
    setLoadingProgress(100);
    onInteraction?.({
      type: "image_loaded",
      src,
      timestamp: new Date(),
    });
  }, [src, onInteraction]);

  const handleImageError = useCallback(() => {
    setImageError(true);
    onInteraction?.({
      type: "image_error",
      src,
      timestamp: new Date(),
    });
  }, [src, onInteraction]);

  const handleImageProgress = useCallback((event: ProgressEvent) => {
    if (event.lengthComputable) {
      const progress = (event.loaded / event.total) * 100;
      setLoadingProgress(progress);
    }
  }, []);

  return (
    <div className={`space-y-4 ${className}`}>
      <div
        className="floating-card p-4"
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
      >
        {title && (
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: EducationColors.primary }}
            >
              <ImageIcon className="h-4 w-4 text-white" />
            </div>
            <h3
              className={TypographyClasses.cardTitle}
              style={{ color: "var(--foreground)" }}
            >
              {title}
            </h3>
          </div>
        )}

        <div className="relative">
          {/* Loading State */}
          {!imageLoaded && !imageError && (
            <div className="w-full h-64 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <div
                  className="w-12 h-12 rounded-full border-4 border-gray-300 border-t-4 animate-spin mb-3"
                  style={{ borderTopColor: EducationColors.primary }}
                  aria-hidden="true"
                />
                <p className="text-sm opacity-70">Loading image...</p>
                {loadingProgress > 0 && (
                  <div className="w-32 h-2 bg-gray-200 rounded-full mt-2 mx-auto">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: EducationColors.primary,
                        width: `${loadingProgress}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error State */}
          {imageError && (
            <div className="w-full h-64 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center justify-center border border-red-200 dark:border-red-800">
              <div className="text-center">
                <ImageIcon className="h-12 w-12 mx-auto mb-3 text-red-400" />
                <p className="text-sm text-red-600 dark:text-red-400 mb-2">
                  Failed to load image
                </p>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setImageError(false);
                    setImageLoaded(false);
                    setLoadingProgress(0);
                  }}
                  style={{ borderColor: "var(--color-warm-coral)" }}
                >
                  Retry
                </Button>
              </div>
            </div>
          )}

          {/* Image */}
          {!imageError && (
            <motion.img
              src={src}
              srcSet={srcSet}
              sizes={sizes}
              alt={alt}
              className={`w-full h-auto rounded-lg cursor-pointer transition-transform duration-300 ${
                isZoomed ? "scale-150" : "scale-100"
              } ${!imageLoaded ? "opacity-0" : "opacity-100"}`}
              onClick={() => setIsZoomed(!isZoomed)}
              onLoad={handleImageLoad}
              onError={handleImageError}
              whileHover={{ scale: isZoomed ? 1.5 : 1.05 }}
              style={{ transformOrigin: "center" }}
              loading={loading}
              role="img"
              aria-describedby={title ? `image-description-${src}` : undefined}
            />
          )}

          {/* Annotations */}
          {imageLoaded &&
            annotations.map((annotation, index) => (
              <motion.button
                key={index}
                className="absolute w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-white text-xs font-bold cursor-pointer"
                style={{
                  backgroundColor: EducationColors.primary,
                  left: `${annotation.x}%`,
                  top: `${annotation.y}%`,
                  transform: "translate(-50%, -50%)",
                }}
                onClick={() => handleAnnotationClick(index)}
                whileHover={{ scale: 1.2 }}
                whileTap={{ scale: 0.9 }}
                animate={{
                  scale: selectedAnnotation === index ? 1.3 : 1,
                  boxShadow:
                    selectedAnnotation === index
                      ? `0 0 20px ${EducationColors.primary}80`
                      : "0 4px 8px rgba(0,0,0,0.2)",
                }}
                aria-label={`Annotation ${index + 1}: ${annotation.title}`}
              >
                {index + 1}
              </motion.button>
            ))}

          {/* Zoom Controls */}
          <div className="absolute top-2 right-2 flex gap-2">
            <ActionIcon
              variant="filled"
              onClick={() => setIsZoomed(!isZoomed)}
              style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
              className="text-white"
              aria-label={isZoomed ? "Zoom out" : "Zoom in"}
            >
              {isZoomed ? <ZoomOut size={16} /> : <ZoomIn size={16} />}
            </ActionIcon>
          </div>
        </div>

        {/* Annotation Details */}
        <AnimatePresence>
          {selectedAnnotation !== null && annotations[selectedAnnotation] && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mt-4 p-4 rounded-lg"
              style={{
                backgroundColor: `${EducationColors.primary}10`,
                borderColor: `${EducationColors.primary}40`,
                border: "1px solid",
              }}
            >
              <h4
                className="font-medium mb-2"
                style={{ color: EducationColors.primary }}
              >
                {annotations[selectedAnnotation].title}
              </h4>
              <p className="text-sm text-flow-natural">
                {annotations[selectedAnnotation].description}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Export all multimedia components
 */
export const MultimediaComponents = {
  VideoPlayer,
  AudioPlayer,
  InteractiveImage,
};

export default MultimediaComponents;
