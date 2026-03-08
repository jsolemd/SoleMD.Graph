import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility function to merge Tailwind CSS classes with proper conflict resolution
 * Combines clsx for conditional classes and tailwind-merge for deduplication
 *
 * @param inputs - Array of class values (strings, objects, arrays)
 * @returns Merged and deduplicated class string
 *
 * @example
 * cn("px-4 py-2", "bg-blue-500", { "text-white": true })
 * // Returns: "px-4 py-2 bg-blue-500 text-white"
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Re-export for backward compatibility — all existing imports from '@/lib/utils' continue to work
export * from './navigation';
export * from './helpers';
