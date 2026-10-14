/**
 * Packaging words for Add item and Edit item (G-56).
 *
 * Packaging is free text, so 'Bag', 'bag' and 'Bags' used to become three
 * packages. The forms show the words this facility already uses as chips
 * under the field, and a typed word that matches one of them (ignoring case
 * and spaces) is saved in that word's spelling.
 */
import { useEffect, useState } from 'react';
import { itemService } from '@/services/item-service';
import { DEFAULT_ITEM_FILTERS } from '@/types/item.types';

/** At most this many chips under the field. */
export const MAX_PACKAGING_SUGGESTIONS = 6;
/** How many items are read to find the words in use. */
const ITEMS_READ = 500;

export interface PackagingGroup {
  /** The word with case and outer spaces folded away. */
  key: string;
  /** The most used spelling of the word (ties: A to Z). */
  label: string;
  /** How many items use the word, in any spelling. */
  count: number;
}

const fold = (value: string) => value.trim().toLowerCase();
const before = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The packaging words in use, most used first, ties A to Z. */
export function packagingGroups(values: ReadonlyArray<string | null | undefined>): PackagingGroup[] {
  const spellings = new Map<string, Map<string, number>>();
  for (const value of values) {
    const spelling = value?.trim();
    if (!spelling) continue;
    const key = fold(spelling);
    const group = spellings.get(key) ?? new Map<string, number>();
    group.set(spelling, (group.get(spelling) ?? 0) + 1);
    spellings.set(key, group);
  }
  return [...spellings.entries()]
    .map(([key, group]) => {
      const ranked = [...group.entries()].sort((a, b) => b[1] - a[1] || before(a[0], b[0]));
      const count = [...group.values()].reduce((sum, n) => sum + n, 0);
      return { key, label: ranked[0][0], count };
    })
    .sort((a, b) => b.count - a.count || before(a.key, b.key));
}

/** The words for the chips. */
export function packagingSuggestions(values: ReadonlyArray<string | null | undefined>): string[] {
  return packagingGroups(values)
    .slice(0, MAX_PACKAGING_SUGGESTIONS)
    .map((group) => group.label);
}

/** The spelling in use for the typed packaging, or undefined when no item uses that word. */
export function matchingPackaging(value: string, groups: ReadonlyArray<PackagingGroup>): string | undefined {
  const typed = fold(value);
  return typed ? groups.find((group) => group.key === typed)?.label : undefined;
}

/** The typed packaging in the spelling already in use; a new word stays as typed (outer spaces removed). */
export function normalizePackaging(value: string, groups: ReadonlyArray<PackagingGroup>): string {
  return matchingPackaging(value, groups) ?? value.trim();
}

/** Reads the words in use once when the form opens. Nothing is shown if the read fails. */
export function usePackagingWords(): { groups: PackagingGroup[]; suggestions: string[] } {
  const [groups, setGroups] = useState<PackagingGroup[]>([]);
  useEffect(() => {
    let current = true;
    itemService
      .getItemList(DEFAULT_ITEM_FILTERS, ITEMS_READ, 0)
      .then((response) => {
        if (current && response.success) setGroups(packagingGroups(response.data.map((item) => item.packaging)));
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);
  return { groups, suggestions: groups.slice(0, MAX_PACKAGING_SUGGESTIONS).map((group) => group.label) };
}
