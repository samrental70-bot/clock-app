import { Component } from "react";
import EmployeeClockApp from "./EmployeeClockApp";
import {
  supabaseAppMode,
  supabaseClientReady,
  supabaseConfigIssue,
  supabaseExpectedProjectRefMasked,
  supabaseProjectRefMasked,
} from "./supabaseClient";

const OPERA_APP_NAME = import.meta.env.VITE_OPERA_APP_NAME || "OPERA.AI";

function errorCodeFor(error) {
  const raw = `${error?.name || "Error"}:${error?.message || ""}:${error?.stack || ""}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `OPERA-${hash.toString(16).toUpperCase().padStart(8, "0")}`;
}

function clearOperaLocalCache() {
  try {
    const keys = Object.keys(window.localStorage || {});
    for (const key of keys) {
      if (key.startsWith("orp_") || key.startsWith("opera_")) {
        window.localStorage.removeItem(key);
      }
    }
  } catch (err) {
    console.warn("[APP_ERROR] local cache clear failed", err);
  }
  window.location.reload();
}

function EnvironmentGate() {
  return (
    <div className="min-h-screen bg-[#F4F7FB] px-4 py-10 text-slate-900">
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#C9A227]">Environment check</p>
          <h1 className="mt-2 text-2xl font-black text-[#061426]">Supabase project mismatch</h1>
          <p className="mt-2 text-sm font-medium text-slate-600">
            This build is refusing to connect because the active Supabase project does not match the expected
            {supabaseAppMode} environment.
          </p>
        </div>

        <div className="rounded-[18px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Detected project ref</p>
          <p className="mt-1 text-sm font-semibold text-[#061426]">{supabaseProjectRefMasked || "Unavailable"}</p>
          <p className="mt-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Expected project ref</p>
          <p className="mt-1 text-sm font-semibold text-[#061426]">{supabaseExpectedProjectRefMasked || "Unavailable"}</p>
        </div>

        <div className="rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {supabaseConfigIssue || "Supabase environment is blocked until the correct project ref is restored."}
        </div>

        <button
          type="button"
          className="h-12 w-full rounded-[14px] bg-[#061426] px-4 text-[15px] font-semibold text-white"
          onClick={() => window.location.reload()}
        >
          Reload after fixing the environment
        </button>
      </div>
    </div>
  );
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[APP_ERROR]", error, info);
  }

  render() {
    if (this.state.error) {
      const code = errorCodeFor(this.state.error);
      const message = this.state.error?.message || "Unknown render error";
      return (
        <div className="min-h-screen bg-[#F4F7FB] flex items-center justify-center p-4 text-slate-900">
          <div className="w-full max-w-sm rounded-[20px] border border-slate-200 bg-white p-5 text-center shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
            <h1 className="text-xl font-black">Something went wrong</h1>
            <p className="mt-2 text-sm font-semibold text-slate-600">Please reload {OPERA_APP_NAME}.</p>
            <div className="mt-4 rounded-[14px] border border-slate-200 bg-slate-50 p-3 text-left">
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">Error code</p>
              <p className="mt-1 break-all text-[14px] font-black text-slate-950">{code}</p>
              <p className="mt-2 break-words text-[12px] font-semibold text-slate-600">{message}</p>
            </div>
            <button
              type="button"
              className="mt-4 h-12 w-full rounded-[14px] bg-[#0B1F33] px-4 text-[15px] font-semibold text-white"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
            <button
              type="button"
              className="mt-2 h-11 w-full rounded-[14px] border border-slate-300 bg-white px-4 text-[15px] font-semibold text-slate-700"
              onClick={clearOperaLocalCache}
            >
              Fix Local Data and Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  if (!supabaseClientReady) {
    return (
      <AppErrorBoundary>
        <EnvironmentGate />
      </AppErrorBoundary>
    );
  }

  return (
    <AppErrorBoundary>
      <EmployeeClockApp />
    </AppErrorBoundary>
  );
}
