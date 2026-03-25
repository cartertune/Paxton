const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export default function LoginPage() {
  const handleSignIn = () => {
    window.location.href = `${API_BASE}/api/auth/google`;
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="bg-white border border-stone-200 rounded-lg shadow-sm p-10 w-full max-w-sm flex flex-col items-center gap-6">
        {/* Logo mark */}
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-stone-50 border border-stone-200">
          <svg
            className="w-7 h-7"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect
              x="2"
              y="4"
              width="20"
              height="16"
              rx="2"
              stroke="#EA4335"
              strokeWidth="1.5"
            />
            <path
              d="M2 7l10 7 10-7"
              stroke="#EA4335"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="text-center">
          <h1 className="font-serif text-2xl font-semibold text-stone-900">
            Paxton
          </h1>
          <p className="mt-2 text-sm text-stone-500">
            Triage your inbox with AI — sorted in seconds.
          </p>
        </div>

        <button
          onClick={handleSignIn}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-[#4285F4] hover:bg-[#3367D6] text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#fff"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#fff"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#fff"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#fff"
            />
          </svg>
          Sign in with Google
        </button>

        <p className="text-xs text-stone-400 text-center">
          Read-only access to Gmail. No emails are stored.
        </p>
      </div>
    </div>
  );
}
