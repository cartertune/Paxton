import { useReducer } from 'react';
import type { Thread, Bucket } from '../types';
import { clearAllCaches } from '../cache';

export type AppStatus = 'idle' | 'loading' | 'classifying' | 'ready' | 'error';

export interface AppState {
  status: AppStatus;
  threads: Thread[];
  buckets: Bucket[];
  error: string | null;
  userEmail: string | null;
}

export type Action =
  | { type: 'SET_STATUS'; payload: AppStatus }
  | { type: 'SET_THREADS'; payload: Thread[] }
  | { type: 'BATCH_RESOLVED'; payload: Thread[] }
  | { type: 'SET_BUCKETS'; payload: Bucket[] }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'SET_USER'; payload: string }
  | { type: 'REMOVE_THREAD'; payload: string }
  | { type: 'MARK_THREAD_READ'; payload: string }
  | { type: 'RESET' };

const STORAGE_KEY = 'paxton_state';

interface PersistedState {
  threads: Thread[];
  userEmail: string | null;
}

function loadFromStorage(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedState;
  } catch {
    return {};
  }
}

function saveToStorage(state: AppState) {
  try {
    const persisted: PersistedState = {
      threads: state.threads,
      userEmail: state.userEmail,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // Storage quota exceeded or unavailable — silently ignore
  }
}

function clearStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

const stored = loadFromStorage();

const initialState: AppState = {
  status: stored.threads && stored.threads.length > 0 ? 'ready' : 'idle',
  threads: stored.threads ?? [],
  buckets: [],
  error: null,
  userEmail: stored.userEmail ?? null,
};

function reducer(state: AppState, action: Action): AppState {
  let next: AppState;
  switch (action.type) {
    case 'SET_STATUS':
      next = { ...state, status: action.payload, error: null };
      break;
    case 'SET_THREADS':
      next = { ...state, threads: action.payload, status: 'ready' };
      break;
    case 'BATCH_RESOLVED': {
      // Merge new threads in, deduplicate by id (newer result wins)
      // Do NOT change status — threads are buffered until SET_STATUS:'ready' fires on done
      const existingIds = new Set(state.threads.map((t) => t.id));
      const incoming = action.payload.filter((t) => !existingIds.has(t.id));
      const updated = state.threads
        .map((t) => {
          const replacement = action.payload.find((p) => p.id === t.id);
          return replacement ?? t;
        })
        .concat(incoming);
      next = { ...state, threads: updated };
      break;
    }
    case 'SET_BUCKETS':
      next = { ...state, buckets: action.payload };
      break;
    case 'SET_ERROR':
      next = { ...state, status: 'error', error: action.payload };
      break;
    case 'SET_USER':
      next = { ...state, userEmail: action.payload };
      break;
    case 'REMOVE_THREAD':
      next = { ...state, threads: state.threads.filter((t) => t.id !== action.payload) };
      break;
    case 'MARK_THREAD_READ':
      next = {
        ...state,
        threads: state.threads.map((t) =>
          t.id === action.payload ? { ...t, unread: false } : t
        ),
      };
      break;
    case 'RESET':
      clearStorage();
      clearAllCaches();
      return { ...initialState, status: 'idle', threads: [], buckets: [], userEmail: null };
    default:
      return state;
  }

  saveToStorage(next);
  return next;
}

export function useEmailStore() {
  return useReducer(reducer, initialState);
}
