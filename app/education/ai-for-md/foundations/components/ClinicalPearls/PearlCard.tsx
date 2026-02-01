'use client';

import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark } from 'lucide-react';
import { ClinicalPearl } from './data';
import { Sparkline, ProgressArc } from './PearlVisuals';
import { getEvidenceLevelColor, getEvidenceLevelLabel, highlightSearchTerms } from './filters';

interface PearlCardProps {
  pearl: ClinicalPearl;
  isActive?: boolean;
  searchQuery?: string;
  onBookmark?: (pearlId: string) => void;
  isBookmarked?: boolean;
  reducedMotion?: boolean;
}

export function PearlCard({
  pearl,
  isActive = false,
  searchQuery = '',
  onBookmark,
  isBookmarked = false,
  reducedMotion = false
}: PearlCardProps) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const categoryColors = {
    circadian: '#3B82F6',
    pharmacology: '#EF4444',
    behavioral: '#10B981'
  };

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleFlip();
    }
  };

  const handleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    onBookmark?.(pearl.id);
  };

  const cardVariants = {
    initial: {
      scale: 0.95,
      opacity: 0.8,
      rotateY: 0
    },
    active: {
      scale: isActive ? 1.05 : 1,
      opacity: 1,
      rotateY: isFlipped ? 180 : 0,
      transition: {
        duration: reducedMotion ? 0.1 : 0.6,
        ease: [0.23, 1, 0.32, 1]
      }
    },
    hover: {
      scale: 1.02,
      y: -4,
      transition: {
        duration: 0.2,
        ease: 'easeOut'
      }
    }
  };

  const glowVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: isActive ? 1 : 0,
      transition: { duration: 0.3 }
    }
  };

  // Handle reduced motion
  const flipTransition = reducedMotion
    ? { duration: 0 }
    : { duration: 0.6, ease: [0.23, 1, 0.32, 1] };

  return (
    <div className="relative">
      {/* Glow effect for active card */}
      <motion.div
        className="absolute inset-0 rounded-2xl blur-xl"
        style={{
          background: `linear-gradient(135deg, ${categoryColors[pearl.category]}40, ${categoryColors[pearl.category]}20)`
        }}
        variants={glowVariants}
        animate={isActive ? 'visible' : 'hidden'}
      />

      <motion.div
        ref={cardRef}
        className="relative w-80 h-96 cursor-pointer"
        style={{ perspective: '1000px' }}
        variants={cardVariants}
        initial="initial"
        animate="active"
        whileHover={!reducedMotion ? "hover" : undefined}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
        onClick={handleFlip}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-label={`Clinical pearl: ${pearl.title}. ${isFlipped ? 'Showing details' : 'Showing summary'}. Press Enter to flip.`}
      >
        <AnimatePresence mode="wait">
          {!isFlipped ? (
            <motion.div
              key="front"
              className="absolute inset-0 w-full h-full"
              style={{ backfaceVisibility: 'hidden' }}
              initial={{ rotateY: 0 }}
              animate={{ rotateY: 0 }}
              exit={{ rotateY: 180 }}
              transition={flipTransition}
            >
              <CardFront
                pearl={pearl}
                searchQuery={searchQuery}
                onBookmark={handleBookmark}
                isBookmarked={isBookmarked}
                isHovered={isHovered}
              />
            </motion.div>
          ) : (
            <motion.div
              key="back"
              className="absolute inset-0 w-full h-full"
              style={{ backfaceVisibility: 'hidden' }}
              initial={{ rotateY: -180 }}
              animate={{ rotateY: 0 }}
              exit={{ rotateY: -180 }}
              transition={flipTransition}
            >
              <CardBack
                pearl={pearl}
                searchQuery={searchQuery}
                onBookmark={handleBookmark}
                isBookmarked={isBookmarked}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

interface CardFrontProps {
  pearl: ClinicalPearl;
  searchQuery: string;
  onBookmark: (e: React.MouseEvent) => void;
  isBookmarked: boolean;
  isHovered: boolean;
}

function CardFront({ pearl, searchQuery, onBookmark, isBookmarked, isHovered }: CardFrontProps) {
  const categoryColors = {
    circadian: '#3B82F6',
    pharmacology: '#EF4444',
    behavioral: '#10B981'
  };

  return (
    <div
      className="w-full h-full bg-white rounded-2xl shadow-lg border border-gray-200 p-6 flex flex-col"
      style={{
        borderTop: `4px solid ${categoryColors[pearl.category]}`
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: categoryColors[pearl.category] }}
            />
            <span className="text-sm font-medium text-gray-600 capitalize">
              {pearl.category}
            </span>
          </div>
          <h3
            className="text-lg font-bold text-gray-900 leading-tight"
            dangerouslySetInnerHTML={{
              __html: highlightSearchTerms(pearl.title, searchQuery)
            }}
          />
        </div>

        <motion.button
          onClick={onBookmark}
          className={`p-2 rounded-lg transition-colors ${
            isBookmarked
              ? 'bg-yellow-100 text-yellow-600'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
          }`}
          whileTap={{ scale: 0.95 }}
          aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
        >
          <Bookmark size={16} fill={isBookmarked ? 'currentColor' : 'none'} />
        </motion.button>
      </div>

      {/* Icon placeholder - would use Lottie in production */}
      <div className="flex justify-center mb-4">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `${categoryColors[pearl.category]}20` }}
        >
          <div
            className="w-8 h-8 rounded-full"
            style={{ backgroundColor: categoryColors[pearl.category] }}
          />
        </div>
      </div>

      {/* Summary */}
      <p
        className="text-gray-700 text-sm leading-relaxed mb-6 flex-1"
        dangerouslySetInnerHTML={{
          __html: highlightSearchTerms(pearl.summary, searchQuery)
        }}
      />

      {/* Quick Stat with Sparkline */}
      <div className="bg-gray-50 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-2xl font-bold text-gray-900">
              {pearl.frontContent.quickStat.value}
              <span className="text-sm font-normal text-gray-600 ml-1">
                {pearl.frontContent.quickStat.unit}
              </span>
            </div>
          </div>
          <div className="flex-shrink-0">
            <Sparkline
              data={pearl.frontContent.quickStat.trend}
              width={60}
              height={30}
              color={categoryColors[pearl.category]}
            />
          </div>
        </div>
        <div className="text-xs text-gray-500">
          Trend visualization
        </div>
      </div>

      {/* Flip hint */}
      <motion.div
        className="text-center mt-4 text-xs text-gray-400"
        animate={{ opacity: isHovered ? 1 : 0.6 }}
      >
        Click to view details →
      </motion.div>
    </div>
  );
}

interface CardBackProps {
  pearl: ClinicalPearl;
  searchQuery: string;
  onBookmark: (e: React.MouseEvent) => void;
  isBookmarked: boolean;
}

function CardBack({ pearl, searchQuery, onBookmark, isBookmarked }: CardBackProps) {
  const evidenceColor = getEvidenceLevelColor(pearl.backContent.evidenceLevel.score);
  const evidenceLabel = getEvidenceLevelLabel(pearl.backContent.evidenceLevel.score);

  return (
    <div className="w-full h-full bg-white rounded-2xl shadow-lg border border-gray-200 p-6 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900 flex-1">
          {pearl.title}
        </h3>
        <motion.button
          onClick={onBookmark}
          className={`p-2 rounded-lg transition-colors ${
            isBookmarked
              ? 'bg-yellow-100 text-yellow-600'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600'
          }`}
          whileTap={{ scale: 0.95 }}
        >
          <Bookmark size={16} fill={isBookmarked ? 'currentColor' : 'none'} />
        </motion.button>
      </div>

      {/* Evidence Level */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-shrink-0">
          <ProgressArc
            value={pearl.backContent.evidenceLevel.score}
            width={50}
            height={50}
            color={evidenceColor}
          />
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-900">
            {evidenceLabel} Evidence
          </div>
          <div className="text-xs text-gray-600">
            {pearl.backContent.citations} citations
          </div>
        </div>
      </div>

      {/* Explanation */}
      <div className="mb-4 flex-1 overflow-y-auto">
        <p
          className="text-sm text-gray-700 leading-relaxed mb-3"
          dangerouslySetInnerHTML={{
            __html: highlightSearchTerms(pearl.backContent.explanation, searchQuery)
          }}
        />
      </div>

      {/* Interventions */}
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Key Interventions</h4>
        <ul className="space-y-1">
          {pearl.backContent.interventions.slice(0, 2).map((intervention, index) => (
            <li key={index} className="text-xs text-gray-600 flex items-start">
              <span className="text-green-500 mr-2">•</span>
              <span
                dangerouslySetInnerHTML={{
                  __html: highlightSearchTerms(intervention, searchQuery)
                }}
              />
            </li>
          ))}
        </ul>
      </div>

      {/* Flip hint */}
      <div className="text-center text-xs text-gray-400">
        ← Click to return
      </div>
    </div>
  );
}