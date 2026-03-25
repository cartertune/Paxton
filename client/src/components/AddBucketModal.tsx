import { useState, useRef, useEffect } from "react";
import { getDefaultHint } from "../defaultHints";

interface Props {
  existingBuckets: string[];
  onAdd: (name: string, hint?: string) => void;
  onClose: () => void;
}

function sanitize(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9 _&'(),.!?-]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 50);
}

export default function AddBucketModal({
  existingBuckets,
  onAdd,
  onClose,
}: Props) {
  const [value, setValue] = useState("");
  const [hint, setHint] = useState("");
  // Track whether hint has been manually edited
  const hintManuallyEdited = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sanitized = sanitize(value).trim();
  const isDuplicate = existingBuckets.some(
    (b) => b.toLowerCase() === sanitized.toLowerCase(),
  );
  const isValid = sanitized.length > 0 && !isDuplicate;

  const handleNameChange = (raw: string) => {
    const next = sanitize(raw);
    setValue(next);
    // Auto-populate known default hints, but leave blank for unknown buckets
    if (!hintManuallyEdited.current) {
      setHint(next.length > 0 ? getDefaultHint(next) : "");
    }
  };

  const handleHintChange = (val: string) => {
    hintManuallyEdited.current = true;
    setHint(val);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    onAdd(sanitized, hint.trim() || undefined);
    onClose();
  };

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-stone-900/30 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={handleBackdrop}
    >
      <div className="bg-white border border-stone-200 rounded-lg shadow-sm w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-stone-900 mb-4">
          Add a bucket
        </h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Finance, Work, Family…"
              maxLength={60}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400"
            />
            {isDuplicate && (
              <p className="mt-1.5 text-xs text-red-600">
                A bucket with that name already exists.
              </p>
            )}
          </div>
          <div>
            <textarea
              value={hint}
              onChange={(e) => handleHintChange(e.target.value)}
              placeholder="Describe what emails belong here — used to classify emails"
              maxLength={200}
              rows={2}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 resize-none"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              className="px-4 py-2 text-sm font-medium text-white bg-stone-700 rounded-lg hover:bg-stone-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Create bucket
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
