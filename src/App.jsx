import { Component } from "react";
import EmployeeClockApp from "./EmployeeClockApp";

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
  return (
    <AppErrorBoundary>
      <EmployeeClockApp />
    </AppErrorBoundary>
  );
}
