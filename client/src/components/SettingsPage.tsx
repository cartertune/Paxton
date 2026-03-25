import { useState } from 'react';
import { getDefaultHint } from '../defaultHints';

interface BucketRow {
  name: string;
  hint: string;
  saved: boolean; // whether current hint matches what's persisted
}

interface Props {
  buckets: string[];
  bucketHints: Record<string, string>;
  onSaveBucket: (name: string, hint: string) => void;
  onDeleteBucket: (name: string) => void;
  onAddBucket: (name: string, hint: string) => void;
  onClose: () => void;
}

function sanitizeName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 50);
}

export default function SettingsPage({ buckets, bucketHints, onSaveBucket, onDeleteBucket, onAddBucket, onClose }: Props) {
  const [rows, setRows] = useState<BucketRow[]>(() =>
    buckets.map((name) => ({
      name,
      hint: bucketHints[name] || getDefaultHint(name),
      saved: true,
    }))
  );

  // New bucket form state
  const [newName, setNewName] = useState('');
  const [newHint, setNewHint] = useState('');
  const [addingNew, setAddingNew] = useState(false);

  const updateHint = (name: string, hint: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.name === name
          ? { ...r, hint, saved: hint === (bucketHints[name] || getDefaultHint(name)) }
          : r
      )
    );
  };

  const handleSaveBucket = (name: string, hint: string) => {
    onSaveBucket(name, hint);
    setRows((prev) => prev.map((r) => (r.name === name ? { ...r, saved: true } : r)));
  };

  const handleDelete = (name: string) => {
    if (rows.length <= 1) return;
    onDeleteBucket(name);
    setRows((prev) => prev.filter((r) => r.name !== name));
  };

  const sanitizedNew = sanitizeName(newName);
  const isDupeNew = buckets.some((b) => b.toLowerCase() === sanitizedNew.toLowerCase());
  const newNameValid = sanitizedNew.length > 0 && !isDupeNew;

  const handleNewNameChange = (val: string) => {
    const sanitized = sanitizeName(val);
    setNewName(sanitized);
    if (!newHint || newHint === getDefaultHint(newName)) {
      setNewHint(getDefaultHint(sanitized));
    }
  };

  const handleAddBucket = () => {
    if (!newNameValid) return;
    const hint = newHint.trim() || getDefaultHint(sanitizedNew);
    onAddBucket(sanitizedNew, hint);
    setRows((prev) => [...prev, { name: sanitizedNew, hint, saved: true }]);
    setNewName('');
    setNewHint('');
    setAddingNew(false);
  };

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
        <h1 className="text-base font-semibold text-gray-900">Settings</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAddingNew(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add bucket
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            Close
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Buckets</h2>
            <p className="text-sm text-gray-500 mt-1">
              Each bucket has a classification prompt that tells the AI what emails belong there. Edit and save individually.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {rows.map((row) => (
              <div key={row.name} className="border border-gray-200 rounded-xl p-4 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-900">{row.name}</span>
                  <button
                    onClick={() => handleDelete(row.name)}
                    disabled={rows.length <= 1}
                    title={rows.length <= 1 ? 'Cannot delete the last bucket' : `Delete "${row.name}"`}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </div>

                <label className="block text-xs font-medium text-gray-500 mb-1">Classification prompt</label>
                <textarea
                  value={row.hint}
                  onChange={(e) => updateHint(row.name, e.target.value)}
                  maxLength={300}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-400">{row.hint.length}/300</span>
                  <button
                    onClick={() => handleSaveBucket(row.name, row.hint)}
                    disabled={row.saved}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {row.saved ? 'Saved' : 'Save & reclassify'}
                  </button>
                </div>
              </div>
            ))}

            {/* Add new bucket */}
            {addingNew && (
              <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/40">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">New bucket</p>
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                    <input
                      autoFocus
                      type="text"
                      value={newName}
                      onChange={(e) => handleNewNameChange(e.target.value)}
                      placeholder="e.g. Finance, Work, Family…"
                      maxLength={50}
                      className={`w-full border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        isDupeNew ? 'border-red-400' : 'border-gray-300'
                      }`}
                    />
                    {isDupeNew && <p className="mt-1 text-xs text-red-600">A bucket with that name already exists.</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Classification prompt</label>
                    <textarea
                      value={newHint}
                      onChange={(e) => setNewHint(e.target.value)}
                      maxLength={300}
                      rows={3}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => { setAddingNew(false); setNewName(''); setNewHint(''); }}
                      className="px-3 py-1.5 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddBucket}
                      disabled={!newNameValid}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Create bucket
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
