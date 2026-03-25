import type { DraftResult, SummaryResult } from './types';

// --- Thread body cache ---
// Keyed by thread ID. Survives page refresh, cleared on RESET.

const BODY_CACHE_KEY = 'paxton_body_cache';

function loadBodyCache(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BODY_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveBodyCache(cache: Record<string, string>) {
  try {
    localStorage.setItem(BODY_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // quota exceeded — silently ignore
  }
}

export function getCachedBody(threadId: string): string | null {
  return loadBodyCache()[threadId] ?? null;
}

export function setCachedBody(threadId: string, body: string) {
  const cache = loadBodyCache();
  cache[threadId] = body;
  saveBodyCache(cache);
}

// --- Draft cache ---
// Keyed by thread ID. Cleared when threads are reset (reclassification).

const DRAFT_CACHE_KEY = 'paxton_draft_cache';

function loadDraftCache(): Record<string, DraftResult> {
  try {
    const raw = localStorage.getItem(DRAFT_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, DraftResult>) : {};
  } catch {
    return {};
  }
}

function saveDraftCache(cache: Record<string, DraftResult>) {
  try {
    localStorage.setItem(DRAFT_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // quota exceeded — silently ignore
  }
}

export function getCachedDraft(threadId: string): DraftResult | null {
  return loadDraftCache()[threadId] ?? null;
}

export function setCachedDraft(threadId: string, result: DraftResult) {
  const cache = loadDraftCache();
  cache[threadId] = result;
  saveDraftCache(cache);
}

// --- Summary cache ---
// Keyed by thread ID. Cleared when threads are reset (reclassification).

const SUMMARY_CACHE_KEY = 'paxton_summary_cache';

function loadSummaryCache(): Record<string, SummaryResult> {
  try {
    const raw = localStorage.getItem(SUMMARY_CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, SummaryResult>) : {};
  } catch {
    return {};
  }
}

function saveSummaryCache(cache: Record<string, SummaryResult>) {
  try {
    localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // quota exceeded — silently ignore
  }
}

export function getCachedSummary(threadId: string): SummaryResult | null {
  return loadSummaryCache()[threadId] ?? null;
}

export function setCachedSummary(threadId: string, result: SummaryResult) {
  const cache = loadSummaryCache();
  cache[threadId] = result;
  saveSummaryCache(cache);
}

export function clearAllCaches() {
  try {
    localStorage.removeItem(BODY_CACHE_KEY);
    localStorage.removeItem(DRAFT_CACHE_KEY);
    localStorage.removeItem(SUMMARY_CACHE_KEY);
  } catch {
    // ignore
  }
}
