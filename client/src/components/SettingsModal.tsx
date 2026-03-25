import { useState, useEffect, useRef } from 'react';

interface BucketRow {
  id: string; // stable key for React list rendering
  name: string;
  hint: string;
}

interface Props {
  buckets: string[];
  bucketHints: Record<string, string>;
  onSave: (buckets: Array<{ name: string; hint?: string }>) => void;
  onClose: () => void;
}

function sanitizeName(raw: string): string {
  // Allow alphanumeric, spaces, underscores, dashes — strip everything else
  return raw.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 50);
}

let rowCounter = 0;
function nextId() {
  return `row-${++rowCounter}`;
}

export default function SettingsModal({ buckets, bucketHints, onSave, onClose }: Props) {
  const [rows, setRows] = useState<BucketRow[]>(() =>
    buckets.map((name) => ({ id: nextId(), name, hint: bucketHints[name] ?? '' }))
  );
  const [newRowId, setNewRowId] = useState<string | null>(null);
  const newNameRef = useRef<HTMLInputElement | null>(null);

  // Focus the name input when a new row is added
  useEffect(() => {
    if (newRowId && newNameRef.current) {
      newNameRef.current.focus();
    }
  }, [newRowId]);

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const updateRow = (id: string, field: 'name' | 'hint', value: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, [field]: field === 'name' ? sanitizeName(value) : value }
          : r
      )
    );
  };

  const deleteRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const addRow = () => {
    const id = nextId();
    setRows((prev) => [...prev, { id, name: '', hint: '' }]);
    setNewRowId(id);
  };

  const isDuplicateName = (id: string, name: string) => {
    const lower = name.trim().toLowerCase();
    return rows.some((r) => r.id !== id && r.name.trim().toLowerCase() === lower && lower !== '');
  };

  const handleSave = () => {
    const filtered = rows
      .filter((r) => r.name.trim().length > 0)
      .map((r) => ({ name: r.name.trim(), hint: r.hint.trim() || undefined }));
    onSave(filtered);
    onClose();
  };

  const canDelete = rows.length > 1;

  return (
    <div
      className="fixed inset-0 bg-stone-900/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleBackdrop}
    >
      <div className="bg-white border border-stone-200 rounded-xl shadow-lg w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 shrink-0">
          <h2 className="text-lg font-semibold text-stone-900">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-stone-900">Buckets</h3>
            <p className="text-sm text-stone-500 mt-0.5">
              Edit bucket names and the prompts used to classify emails into them.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {rows.map((row) => {
              const nameTrimmed = row.name.trim();
              const isBlank = nameTrimmed.length === 0;
              const isDupe = isDuplicateName(row.id, row.name);
              const nameInvalid = isBlank || isDupe;

              return (
                <div
                  key={row.id}
                  className="flex gap-3 items-start bg-stone-50 border border-stone-200 rounded-lg p-3"
                >
                  {/* Name + hint stacked */}
                  <div className="flex-1 flex flex-col gap-2">
                    <div>
                      <input
                        ref={row.id === newRowId ? newNameRef : undefined}
                        type="text"
                        value={row.name}
                        onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                        placeholder="Bucket name"
                        maxLength={50}
                        className={`w-full border rounded-lg px-3 py-1.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 transition-colors ${
                          nameInvalid && nameTrimmed !== ''
                            ? 'border-red-400 focus:ring-red-300'
                            : nameInvalid && nameTrimmed === '' && row.id !== newRowId
                            ? 'border-red-400 focus:ring-red-300'
                            : 'border-stone-300 focus:ring-stone-400'
                        }`}
                      />
                      {isDupe && (
                        <p className="mt-1 text-xs text-red-600">Duplicate name.</p>
                      )}
                    </div>
                    <textarea
                      value={row.hint}
                      onChange={(e) => updateRow(row.id, 'hint', e.target.value)}
                      placeholder="Describe what emails belong here…"
                      maxLength={300}
                      rows={2}
                      className="w-full border border-stone-300 rounded-lg px-3 py-1.5 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 resize-none"
                    />
                  </div>

                  {/* Delete button */}
                  <button
                    type="button"
                    onClick={() => deleteRow(row.id)}
                    disabled={!canDelete}
                    title={canDelete ? 'Delete bucket' : 'Cannot delete the last bucket'}
                    className="mt-0.5 p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                    aria-label="Delete bucket"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add bucket button */}
          <button
            type="button"
            onClick={addRow}
            className="mt-3 flex items-center gap-1.5 px-3 py-2 text-sm text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add bucket
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-stone-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-stone-800 rounded-lg hover:bg-stone-900 transition-colors"
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
