import { useEffect, useRef, useState } from "react";
import { api, setAuthToken, getAuthToken } from "./api/client";
import { useEmailStore } from "./hooks/useEmailStore";
import LoginPage from "./components/LoginPage";
import EmailDashboard from "./components/EmailDashboard";
import ErrorBanner from "./components/ErrorBanner";
import SettingsPage from "./components/SettingsPage";
import type { BucketSuggestion } from "./types";

// Version from vite config or fallback
const VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0";

export default function App() {
  const [state, dispatch] = useEmailStore();
  const classifyingRef = useRef(false);
  const [showSettings, setShowSettings] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(
    // If we have cached threads, assume they were synced recently (we don't know exactly when)
    null,
  );
  const [bucketSuggestions, setBucketSuggestions] = useState<
    BucketSuggestion[]
  >([]);

  // Mirror state into a ref so the poll interval always reads current values
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // On mount: check auth; load settings from DB; skip classification if we already have cached threads
  useEffect(() => {
    async function init() {
      // Check for token in URL (from OAuth callback)
      const urlParams = new URLSearchParams(window.location.search);
      const tokenFromUrl = urlParams.get("token");
      if (tokenFromUrl) {
        setAuthToken(tokenFromUrl);
        // Clean up URL
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname,
        );
      }

      // Check if we have a token
      if (!getAuthToken()) {
        dispatch({ type: "SET_STATUS", payload: "idle" });
        return;
      }

      try {
        const { email } = await api.getMe();
        dispatch({ type: "SET_USER", payload: email });

        // Always load bucket settings from the DB so they stay in sync
        try {
          const settings = await api.getSettings();
          if (settings.buckets.length > 0) {
            dispatch({ type: "SET_BUCKETS", payload: settings.buckets });
          }
        } catch {
          // Settings endpoint not yet deployed — fall back to local state
        }

        if (state.threads.length > 0) {
          // Already have classified results in localStorage — show them immediately
          dispatch({ type: "SET_STATUS", payload: "ready" });
          return;
        }

        dispatch({ type: "SET_STATUS", payload: "loading" });
        await classify(state.buckets, state.bucketHints);
      } catch {
        // Not logged in — stay idle
        dispatch({ type: "SET_STATUS", payload: "idle" });
      }
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-poll every 90 seconds for new threads, classify only the new ones silently
  useEffect(() => {
    const POLL_INTERVAL_MS = 90_000;

    const poll = async () => {
      if (classifyingRef.current) return;
      if (document.visibilityState === "hidden") return;
      if (stateRef.current.status !== "ready") return;

      try {
        const { ids } = await api.getThreadIds();
        const knownIds = new Set(stateRef.current.threads.map((t) => t.id));
        const newIds = ids.filter((id) => !knownIds.has(id));
        if (newIds.length === 0) return;

        const { threads } = await api.classifyIncremental(
          newIds,
          stateRef.current.buckets,
          stateRef.current.bucketHints,
        );
        if (threads.length > 0) {
          dispatch({ type: "BATCH_RESOLVED", payload: threads });
          setLastSyncedAt(new Date());
        }
      } catch {
        // Silent — polling errors should not surface to the user
      }
    };

    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function classify(
    buckets: string[],
    bucketHints: Record<string, string>,
  ) {
    if (classifyingRef.current) return;
    classifyingRef.current = true;
    dispatch({ type: "SET_STATUS", payload: "classifying" });
    dispatch({
      type: "SET_PROGRESS",
      payload: { completedBatches: 0, totalBatches: 0 },
    });

    try {
      await api.classifyStream(buckets, bucketHints, {
        onProgress: (completedBatches, totalBatches) => {
          dispatch({
            type: "SET_PROGRESS",
            payload: { completedBatches, totalBatches },
          });
        },
        onBatch: (threads) => {
          dispatch({ type: "BATCH_RESOLVED", payload: threads });
        },
        onDone: () => {
          dispatch({ type: "SET_STATUS", payload: "ready" });
          setLastSyncedAt(new Date());
          api
            .suggestBuckets(stateRef.current.threads)
            .then((res) => setBucketSuggestions(res.suggestions))
            .catch(() => {}); // silently ignore
        },
        onError: (message) => {
          dispatch({ type: "SET_ERROR", payload: message });
        },
      });
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        payload:
          err instanceof Error ? err.message : "Failed to classify emails",
      });
    } finally {
      classifyingRef.current = false;
    }
  }

  const handleAddBucket = (name: string, hint?: string) => {
    dispatch({ type: "ADD_BUCKET", payload: { name, hint } });
    // Reclassify with the new bucket included — build updated lists directly
    // since state hasn't re-rendered yet
    const updatedBuckets = state.buckets.includes(name)
      ? state.buckets
      : [...state.buckets, name];
    const updatedHints = hint
      ? { ...state.bucketHints, [name]: hint }
      : state.bucketHints;
    classify(updatedBuckets, updatedHints);
  };

  const handleSync = () => {
    dispatch({ type: "SET_THREADS", payload: [] });
    classify(state.buckets, state.bucketHints);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      setAuthToken(null);
      dispatch({ type: "RESET" });
    }
  };

  const handleSaveBucket = async (name: string, hint: string) => {
    const updatedBuckets = state.buckets.includes(name)
      ? state.buckets
      : [...state.buckets, name];
    const updatedHints = { ...state.bucketHints, [name]: hint };
    const payload = updatedBuckets.map((b) => ({
      name: b,
      hint: updatedHints[b],
    }));
    try {
      await api.saveSettings(payload);
    } catch {
      // Non-fatal
    }
    dispatch({ type: "SET_BUCKETS", payload });
    classify(updatedBuckets, updatedHints);
  };

  const handleDeleteBucket = async (name: string) => {
    const updatedBuckets = state.buckets.filter((b) => b !== name);
    const updatedHints = { ...state.bucketHints };
    delete updatedHints[name];
    const payload = updatedBuckets.map((b) => ({
      name: b,
      hint: updatedHints[b],
    }));
    try {
      await api.saveSettings(payload);
    } catch {
      // Non-fatal
    }
    dispatch({ type: "SET_BUCKETS", payload });
    classify(updatedBuckets, updatedHints);
  };

  const handleAddBucketFromSettings = (name: string, hint: string) => {
    const updatedBuckets = [...state.buckets, name];
    const updatedHints = { ...state.bucketHints, [name]: hint };
    const payload = updatedBuckets.map((b) => ({
      name: b,
      hint: updatedHints[b],
    }));
    api.saveSettings(payload).catch(() => {});
    dispatch({ type: "ADD_BUCKET", payload: { name, hint } });
    classify(updatedBuckets, updatedHints);
  };

  const isClassifying =
    state.status === "loading" || state.status === "classifying";

  // Show login page when idle and not authenticated
  if (state.status === "idle") {
    return (
      <>
        <LoginPage />
        {/* Version number in bottom right */}
        <div className="fixed bottom-4 right-4 text-xs text-stone-400 pointer-events-none">
          v{VERSION}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Version number in bottom right */}
      <div className="fixed bottom-4 right-4 text-xs text-stone-400 pointer-events-none">
        v{VERSION}
      </div>
      {state.status === "error" && state.error && (
        <ErrorBanner
          message={state.error}
          onDismiss={() => dispatch({ type: "SET_STATUS", payload: "ready" })}
        />
      )}

      {(state.status === "ready" ||
        isClassifying ||
        state.threads.length > 0) && (
        <EmailDashboard
          threads={state.threads}
          buckets={state.buckets}
          userEmail={state.userEmail}
          onAddBucket={handleAddBucket}
          onSync={handleSync}
          onLogout={handleLogout}
          onOpenSettings={() => setShowSettings(true)}
          isClassifying={isClassifying}
          completedBatches={state.completedBatches}
          totalBatches={state.totalBatches}
          lastSyncedAt={lastSyncedAt}
          bucketSuggestions={bucketSuggestions}
          onDismissSuggestion={(name) =>
            setBucketSuggestions((s) => s.filter((x) => x.name !== name))
          }
          onAcceptSuggestion={(suggestion) => {
            dispatch({
              type: "ADD_BUCKET",
              payload: { name: suggestion.name, hint: suggestion.hint },
            });
            const updatedBuckets = state.buckets.includes(suggestion.name)
              ? state.buckets
              : [...state.buckets, suggestion.name];
            const updatedHints = suggestion.hint
              ? { ...state.bucketHints, [suggestion.name]: suggestion.hint }
              : state.bucketHints;
            const payload = updatedBuckets.map((b) => ({
              name: b,
              hint: updatedHints[b],
            }));
            api.saveSettings(payload).catch(() => {});
            setBucketSuggestions((s) =>
              s.filter((x) => x.name !== suggestion.name),
            );
          }}
          onRemoveThread={(id) =>
            dispatch({ type: "REMOVE_THREAD", payload: id })
          }
          onMarkThreadRead={(id) =>
            dispatch({ type: "MARK_THREAD_READ", payload: id })
          }
        />
      )}

      {showSettings && (
        <SettingsPage
          buckets={state.buckets}
          bucketHints={state.bucketHints}
          onSaveBucket={handleSaveBucket}
          onDeleteBucket={handleDeleteBucket}
          onAddBucket={handleAddBucketFromSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}
