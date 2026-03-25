import { useEffect, useRef, useState } from "react";
import { api, setAuthToken, getAuthToken } from "./api/client";
import { useEmailStore } from "./hooks/useEmailStore";
import LoginPage from "./components/LoginPage";
import EmailDashboard from "./components/EmailDashboard";
import ErrorBanner from "./components/ErrorBanner";
import SettingsPage from "./components/SettingsPage";
import type { Bucket, BucketSuggestion } from "./types";

// Version from vite config or fallback
const VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "1.0.0";

export default function App() {
  const [state, dispatch] = useEmailStore();
  const classifyingRef = useRef(false);
  const [classifyProgress, setClassifyProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [bucketSuggestions, setBucketSuggestions] = useState<BucketSuggestion[]>([]);

  // Mirror state into a ref so the poll interval always reads current values
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // On mount: check auth; load buckets from DB; skip classification if we already have cached threads
  useEffect(() => {
    async function init() {
      // Check for token in URL (from OAuth callback)
      const urlParams = new URLSearchParams(window.location.search);
      const tokenFromUrl = urlParams.get("token");
      if (tokenFromUrl) {
        setAuthToken(tokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      if (!getAuthToken()) {
        dispatch({ type: "SET_STATUS", payload: "idle" });
        return;
      }

      try {
        const { email } = await api.getMe();
        dispatch({ type: "SET_USER", payload: email });

        // Load buckets from DB
        try {
          const settings = await api.getSettings();
          if (settings.buckets.length > 0) {
            dispatch({ type: "SET_BUCKETS", payload: settings.buckets });
          }
        } catch {
          // Settings endpoint unavailable — buckets will be loaded server-side during classify
        }

        if (state.threads.length > 0) {
          dispatch({ type: "SET_STATUS", payload: "ready" });
          return;
        }

        dispatch({ type: "SET_STATUS", payload: "loading" });
        await classify();
      } catch {
        dispatch({ type: "SET_STATUS", payload: "idle" });
      }
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-poll every 90 seconds for new threads
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

        const { threads } = await api.classifyIncremental(newIds);
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

  async function classify() {
    if (classifyingRef.current) return;
    classifyingRef.current = true;
    setClassifyProgress(0);
    dispatch({ type: "SET_STATUS", payload: "classifying" });

    try {
      const { threads } = await api.classifyAll(setClassifyProgress);
      dispatch({ type: "BATCH_RESOLVED", payload: threads });
      dispatch({ type: "SET_STATUS", payload: "ready" });
      setLastSyncedAt(new Date());
      api
        .suggestBuckets(stateRef.current.threads)
        .then((res) => setBucketSuggestions(res.suggestions))
        .catch(() => {});
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        payload: err instanceof Error ? err.message : "Failed to classify emails",
      });
    } finally {
      classifyingRef.current = false;
    }
  }

  async function saveBucketsAndReclassify(buckets: Bucket[]) {
    try {
      const { buckets: saved } = await api.saveSettings(buckets);
      dispatch({ type: "SET_BUCKETS", payload: saved });
    } catch {
      dispatch({ type: "SET_BUCKETS", payload: buckets });
    }
    classify();
  }

  const handleAddBucket = (name: string, hint?: string) => {
    if (state.buckets.some((b) => b.name === name)) return;
    const updated = [...state.buckets, { id: crypto.randomUUID(), name, hint }];
    saveBucketsAndReclassify(updated);
  };

  const handleSync = () => {
    dispatch({ type: "SET_THREADS", payload: [] });
    classify();
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      setAuthToken(null);
      dispatch({ type: "RESET" });
    }
  };

  const handleSaveBucket = (bucket: Bucket) => {
    const updated = state.buckets.some((b) => b.id === bucket.id)
      ? state.buckets.map((b) => (b.id === bucket.id ? bucket : b))
      : [...state.buckets, bucket];
    saveBucketsAndReclassify(updated);
  };

  const handleDeleteBucket = (id: string) => {
    const updated = state.buckets.filter((b) => b.id !== id);
    saveBucketsAndReclassify(updated);
  };

  const isClassifying =
    state.status === "loading" || state.status === "classifying";

  // Show login page when idle and not authenticated
  if (state.status === "idle") {
    return (
      <>
        <LoginPage />
        <div className="fixed bottom-4 right-4 text-xs text-stone-400 pointer-events-none">
          v{VERSION}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 text-xs text-stone-400 pointer-events-none">
        v{VERSION}
      </div>
      {state.status === "error" && state.error && (
        <ErrorBanner
          message={state.error}
          onDismiss={() => dispatch({ type: "SET_STATUS", payload: "ready" })}
        />
      )}

      {(state.status === "ready" || isClassifying || state.threads.length > 0) && (
        <EmailDashboard
          threads={state.threads}
          buckets={state.buckets}
          userEmail={state.userEmail}
          onAddBucket={handleAddBucket}
          onSync={handleSync}
          onLogout={handleLogout}
          onOpenSettings={() => setShowSettings(true)}
          isClassifying={isClassifying}
          classifyProgress={classifyProgress}
          lastSyncedAt={lastSyncedAt}
          bucketSuggestions={bucketSuggestions}
          onDismissSuggestion={(name) =>
            setBucketSuggestions((s) => s.filter((x) => x.name !== name))
          }
          onAcceptSuggestion={(suggestion) => {
            const updated = [...state.buckets, { id: crypto.randomUUID(), name: suggestion.name, hint: suggestion.hint }];
            setBucketSuggestions((s) => s.filter((x) => x.name !== suggestion.name));
            saveBucketsAndReclassify(updated);
          }}
          onRemoveThread={(id) => dispatch({ type: "REMOVE_THREAD", payload: id })}
          onMarkThreadRead={(id) => dispatch({ type: "MARK_THREAD_READ", payload: id })}
        />
      )}

      {showSettings && (
        <SettingsPage
          buckets={state.buckets}
          onSaveBucket={handleSaveBucket}
          onDeleteBucket={handleDeleteBucket}
          onAddBucket={(name, hint) => handleAddBucket(name, hint)}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}
