import React, { Component, useEffect } from "react";
import EmployeeClockApp from "./EmployeeClockApp";
import { supabase } from "./supabaseClient";

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
      return (
        <div className="min-h-screen bg-[#edf2f7] flex items-center justify-center p-4 text-slate-900">
          <div className="w-full max-w-sm rounded-[28px] border border-slate-200 bg-white p-5 text-center shadow-[0_20px_46px_rgba(15,23,42,0.12)]">
            <h1 className="text-xl font-black">Something went wrong</h1>
            <p className="mt-2 text-sm font-semibold text-slate-600">Please reload OPERA.AI.</p>
            <button
              type="button"
              className="mt-4 h-12 w-full rounded-2xl bg-slate-950 px-4 text-[15px] font-black text-white"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    const { data, error } = await supabase.from("employees").select("*");

    if (error) {
      console.log("Supabase error:", error);
    } else {
      console.log("Supabase connected:", data);
    }
  };

  return (
    <AppErrorBoundary>
      <EmployeeClockApp />
    </AppErrorBoundary>
  );
}
