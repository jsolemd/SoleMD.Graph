"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActionIcon, TextInput, Tooltip } from "@mantine/core";
import { Search, X, ChevronUp, ChevronDown } from "lucide-react";
import {
  iconBtnStyles,
  panelSelectStyles,
  panelTextMutedStyle,
} from "@/features/graph/components/panels/PanelShell";

interface WikiModuleSearchProps {
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

const MARK_CLASS = "wiki-module-search-mark";
const ACTIVE_MARK_CLASS = "wiki-module-search-mark-active";

/**
 * In-module text search. Walks text nodes inside the scroll container,
 * wraps matches in <mark> elements, and navigates between hits.
 */
export function WikiModuleSearch({ scrollRef }: WikiModuleSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const marksRef = useRef<HTMLElement[]>([]);

  const clearMarks = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const marks = el.querySelectorAll<HTMLElement>(`.${MARK_CLASS}`);
    for (const mark of marks) {
      const parent = mark.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
      parent.normalize();
    }
    marksRef.current = [];
    setMatchCount(0);
    setActiveIndex(0);
  }, [scrollRef]);

  const applyMarks = useCallback(
    (searchText: string) => {
      clearMarks();
      const el = scrollRef.current;
      if (!el || searchText.length < 2) return;

      const lower = searchText.toLowerCase();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const textNodes: Text[] = [];
      while (walker.nextNode()) {
        textNodes.push(walker.currentNode as Text);
      }

      const marks: HTMLElement[] = [];
      for (const node of textNodes) {
        const text = node.textContent ?? "";
        const lowerText = text.toLowerCase();
        let startIdx = 0;
        let matchIdx = lowerText.indexOf(lower, startIdx);
        if (matchIdx === -1) continue;

        const frag = document.createDocumentFragment();
        while (matchIdx !== -1) {
          frag.appendChild(document.createTextNode(text.slice(startIdx, matchIdx)));
          const mark = document.createElement("mark");
          mark.className = MARK_CLASS;
          mark.textContent = text.slice(matchIdx, matchIdx + lower.length);
          frag.appendChild(mark);
          marks.push(mark);
          startIdx = matchIdx + lower.length;
          matchIdx = lowerText.indexOf(lower, startIdx);
        }
        frag.appendChild(document.createTextNode(text.slice(startIdx)));
        node.parentNode?.replaceChild(frag, node);
      }

      marksRef.current = marks;
      setMatchCount(marks.length);
      if (marks.length > 0) {
        setActiveIndex(0);
        marks[0].classList.add(ACTIVE_MARK_CLASS);
        marks[0].scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
    [clearMarks, scrollRef],
  );

  // Re-apply marks when query changes
  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => applyMarks(query), 200);
    return () => clearTimeout(timeout);
  }, [query, open, applyMarks]);

  const goToMatch = useCallback(
    (index: number) => {
      const marks = marksRef.current;
      if (marks.length === 0) return;
      const wrapped = ((index % marks.length) + marks.length) % marks.length;
      marks[activeIndex]?.classList.remove(ACTIVE_MARK_CLASS);
      marks[wrapped].classList.add(ACTIVE_MARK_CLASS);
      marks[wrapped].scrollIntoView({ behavior: "smooth", block: "center" });
      setActiveIndex(wrapped);
    },
    [activeIndex],
  );

  const handleToggle = useCallback(() => {
    setOpen((prev) => {
      if (!prev) {
        setTimeout(() => inputRef.current?.focus(), 50);
      } else {
        setQuery("");
        clearMarks();
      }
      return !prev;
    });
  }, [clearMarks]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleToggle();
      } else if (e.key === "Enter") {
        e.preventDefault();
        goToMatch(e.shiftKey ? activeIndex - 1 : activeIndex + 1);
      }
    },
    [handleToggle, goToMatch, activeIndex],
  );

  // Clean up marks on unmount
  useEffect(() => {
    return () => clearMarks();
  }, [clearMarks]);

  if (!open) {
    return (
      <Tooltip label="Search in module" position="bottom" withArrow>
        <ActionIcon
          variant="transparent"
          size={24}
          radius="xl"
          className="graph-icon-btn"
          styles={iconBtnStyles}
          onClick={handleToggle}
          aria-label="Search in module"
        >
          <Search size={12} />
        </ActionIcon>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <TextInput
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find..."
        size="xs"
        styles={panelSelectStyles}
        rightSection={
          <ActionIcon
            variant="transparent"
            size={16}
            onClick={handleToggle}
            styles={iconBtnStyles}
            aria-label="Close search"
          >
            <X size={10} />
          </ActionIcon>
        }
        style={{ width: 130 }}
        aria-label="Search in module"
      />
      {matchCount > 0 && (
        <>
          <span style={{ ...panelTextMutedStyle, whiteSpace: "nowrap" }}>
            {activeIndex + 1}/{matchCount}
          </span>
          <ActionIcon
            variant="transparent"
            size={18}
            styles={iconBtnStyles}
            onClick={() => goToMatch(activeIndex - 1)}
            aria-label="Previous match"
          >
            <ChevronUp size={10} />
          </ActionIcon>
          <ActionIcon
            variant="transparent"
            size={18}
            styles={iconBtnStyles}
            onClick={() => goToMatch(activeIndex + 1)}
            aria-label="Next match"
          >
            <ChevronDown size={10} />
          </ActionIcon>
        </>
      )}
    </div>
  );
}
