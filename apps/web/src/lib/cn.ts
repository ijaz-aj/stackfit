import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes, last conflicting utility wins. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
