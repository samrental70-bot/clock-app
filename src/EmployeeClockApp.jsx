import React, { useEffect, useMemo, useState } from "react";

// Simple fallback components (since shadcn is not installed)
const Card = ({ children, className }) => (
  <div className={`bg-white rounded-3xl ${className || ""}`}>{children}</div>
);

const CardContent = ({ children, className }) => (
  <div className={className}>{children}</div>
);

const Button = ({ children, className, ...props }) => (
  <button className={`bg-black text-white ${className || ""}`} {...props}>
    {children}
  </button>
);

const employees = [
  { id: 1, name: "Sam", role: "Admin", hourlyRate: 65 },
  { id: 2, name: "Anmol", role: "Admin", hourlyRate: 40 },
  { id: 3, name: "Worker 1", role: "Drywall", hourlyRate: 35 },
  { id: 4, name: "Worker 2", role: "Helper", hourlyRate: 25 },
];

const adminProjects = [
  {
    id: "basement-renovation",
    name: "Basement Renovation",
    costCenters: ["Framing", "Electrical Rough-In", "Drywall", "Mudding", "Painting", "Cleanup"],
  },
  {
    id: "bathroom-renovation",
    name: "Bathroom Renovation",
    costCenters: ["Demolition", "Plumbing", "Waterproofing", "Tile", "Vanity Install", "Final Fixtures"],
  },
  {
    id: "kitchen-renovation",
    name: "Kitchen Renovation",
    costCenters: ["Demolition", "Electrical", "Cabinets", "Countertop", "Backsplash", "Finishing"],
  },
];

const sampleRecords = [
  {
    id: 101,
    employeeId: 3,
    employee: "Worker 1",
    hourlyRate: 35,
    date: new Date().toISOString(),
    clockIn: "2026-04-25T08:05:00-04:00",
    breakStart: "2026-04-25T12:01:00-04:00",
    breakEnd: "2026-04-25T12:31:00-04:00",
    clockOut: "2026-04-25T16:42:00-04:00",
    project: "Basement Renovation",
    costCenter: "Drywall",
    status: "Submitted",
  },
  {
    id: 102,
    employeeId: 4,
    employee: "Worker 2",
    hourlyRate: 25,
    date: new Date().toISOString(),
    clockIn: "2026-04-25T09:00:00-04:00",
    breakStart: null,
    breakEnd: null,
    clockOut: "2026-04-25T14:30:00-04:00",
    project: "Bathroom Renovation",
    costCenter: "Demolition",
    status: "Submitted",
  },
];

function safeRead(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateParts(date) {
  const d = new Date(date);
  const day = new Intl.DateTimeFormat("en-CA", { weekday: "short" }).format(d);
  const fullDate = new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
  return { day, fullDate };
}

function formatTime(date) {
  return new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function minutesBetween(start, end) {
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
}

function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatTimer(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount || 0);
}

export default function EmployeeClockApp() {
  const [activeTab, setActiveTab] = useState("clock");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(1);
  const [projectId, setProjectId] = useState(adminProjects[0].id);
  const [costCenter, setCostCenter] = useState(adminProjects[0].costCenters[0]);
  const [currentShift, setCurrentShift] = useState(() => safeRead("orp_current_shift", null));
  const [records, setRecords] = useState(() => safeRead("orp_timesheet_records", sampleRecords));
  const [now, setNow] = useState(new Date());
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [editingRecordId, setEditingRecordId] = useState(null);
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");
  const [isChangingTask, setIsChangingTask] = useState(false);
  const [reportRange, setReportRange] = useState("today");
  const [reportType, setReportType] = useState("employee");
  const [reportEmployeeId, setReportEmployeeId] = useState("all");
  const [reportProjectId, setReportProjectId] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId) || employees[0];
  const selectedProject = adminProjects.find((project) => project.id === projectId) || adminProjects[0];
  const isAdmin = selectedEmployee.role === "Admin";

  const getWorkedMinutes = (record) => {
    const total = minutesBetween(record.clockIn, record.clockOut || new Date());
    const breakTotal = record.breakStart && record.breakEnd ? minutesBetween(record.breakStart, record.breakEnd) : 0;
    return Math.max(0, total - breakTotal);
  };

  const getLabourCost = (record) => {
    const hours = getWorkedMinutes(record) / 60;
    const rate = Number(record.hourlyRate || 0);
    return hours * rate;
  };

  const visibleRecords = isAdmin ? records : records.filter((record) => record.employeeId === selectedEmployee.id);
  const visibleCurrentShift = currentShift && (isAdmin || currentShift.employeeId === selectedEmployee.id) ? currentShift : null;
  const filterRecordsByRange = () => {
    const nowDate = new Date();

    return records.filter((record) => {
      const date = new Date(record.clockIn);

      if (reportRange === "today") {
        return date.toDateString() === nowDate.toDateString();
      }

      if (reportRange === "weekly") {
        const weekAgo = new Date();
        weekAgo.setDate(nowDate.getDate() - 7);
        return date >= weekAgo;
      }

      if (reportRange === "monthly") {
        return date.getMonth() === nowDate.getMonth() && date.getFullYear() === nowDate.getFullYear();
      }

      if (reportRange === "yearly") {
        return date.getFullYear() === nowDate.getFullYear();
      }

      if (reportRange === "custom" && customFrom && customTo) {
        return date >= new Date(customFrom) && date <= new Date(customTo);
      }

      return true;
    });
  };

  const filteredRecords = filterRecordsByRange();

  const reportScopedRecords = filteredRecords.filter((record) => {
    if (reportType === "employee" && reportEmployeeId !== "all") {
      return record.employeeId === Number(reportEmployeeId);
    }

    if (reportType === "project" && reportProjectId !== "all") {
      const selectedReportProject = adminProjects.find((project) => project.id === reportProjectId);
      return selectedReportProject ? record.project === selectedReportProject.name : true;
    }

    return true;
  });

  const reportTotalMinutes = reportScopedRecords.reduce((total, record) => total + getWorkedMinutes(record), 0);
  const reportTotalCost = reportScopedRecords.reduce((total, record) => total + getLabourCost(record), 0);

  const employeeReportRows = reportScopedRecords.map((record) => ({
    id: record.id,
    date: formatDateParts(record.clockIn),
    employee: record.employee,
    project: record.project,
    costCenter: record.costCenter,
    cost: getLabourCost(record),
  }));

  const projectReportRows = Object.values(
    reportScopedRecords.reduce((acc, record) => {
      const key = `${record.project}-${record.costCenter}`;
      if (!acc[key]) {
        acc[key] = {
          key,
          date: formatDateParts(record.clockIn),
          project: record.project,
          costCenter: record.costCenter,
          minutes: 0,
          cost: 0,
        };
      }
      acc[key].minutes += getWorkedMinutes(record);
      acc[key].cost += getLabourCost(record);
      return acc;
    }, {})
  );

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    localStorage.setItem("orp_current_shift", JSON.stringify(currentShift));
  }, [currentShift]);

  useEffect(() => {
    localStorage.setItem("orp_timesheet_records", JSON.stringify(records));
  }, [records]);

  useEffect(() => {
    if (!isAdmin && activeTab === "reports") {
      setActiveTab("clock");
    }
  }, [isAdmin, activeTab]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const liveSeconds = useMemo(() => {
    if (!visibleCurrentShift) return 0;
    const totalSeconds = Math.max(0, Math.floor((now - new Date(visibleCurrentShift.clockIn)) / 1000));
    const activeBreakSeconds = visibleCurrentShift.breakStart && !visibleCurrentShift.breakEnd
      ? Math.max(0, Math.floor((now - new Date(visibleCurrentShift.breakStart)) / 1000))
      : 0;
    return Math.max(0, totalSeconds - activeBreakSeconds);
  }, [visibleCurrentShift, now]);

  const liveEarnings = visibleCurrentShift
    ? (liveSeconds / 3600) * Number(visibleCurrentShift.hourlyRate || 0)
    : 0;

  const handleProjectChange = (newProjectId) => {
    const nextProject = adminProjects.find((project) => project.id === newProjectId) || adminProjects[0];
    setProjectId(nextProject.id);
    setCostCenter(nextProject.costCenters[0]);
  };

  const getInstallInstructions = () => {
    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);
    const isChrome = /chrome|crios/.test(ua);
    const isSafari = /safari/.test(ua) && !/crios|chrome/.test(ua);

    if (isIOS && isSafari) {
      return "iPhone: Tap the Share button → Add to Home Screen.";
    }

    if (isIOS && !isSafari) {
      return "iPhone: Open this link in Safari, then tap Share → Add to Home Screen.";
    }

    if (isAndroid && isChrome) {
      return "Android: Tap Chrome menu (⋮) → Install App or Add to Home Screen.";
    }

    return "Use your browser menu and choose Install App or Add to Home Screen.";
  };

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }

    alert(getInstallInstructions());
  };

  const handleClockIn = () => {
    setCurrentShift({
      employeeId: selectedEmployee.id,
      employee: selectedEmployee.name,
      hourlyRate: selectedEmployee.hourlyRate,
      project: selectedProject.name,
      projectId: selectedProject.id,
      costCenter,
      date: new Date().toISOString(),
      clockIn: new Date().toISOString(),
      breakStart: null,
      breakEnd: null,
      status: "Active",
    });
  };

  const handleChangeTask = () => {
    if (!visibleCurrentShift) return;
    setIsChangingTask(true);
  };

  const applyTaskChange = () => {
    if (!visibleCurrentShift) return;
    const updatedProject = adminProjects.find(p => p.id === projectId);
    setCurrentShift({
      ...visibleCurrentShift,
      project: updatedProject.name,
      projectId: updatedProject.id,
      costCenter: costCenter,
    });
    setIsChangingTask(false);
  };

  const handleBreak = () => {
    if (!visibleCurrentShift) return;

    if (!visibleCurrentShift.breakStart) {
      setCurrentShift({ ...visibleCurrentShift, breakStart: new Date().toISOString() });
      return;
    }

    if (!visibleCurrentShift.breakEnd) {
      setCurrentShift({ ...visibleCurrentShift, breakEnd: new Date().toISOString() });
    }
  };

  const handleClockOut = () => {
    if (!visibleCurrentShift) return;

    setRecords([
      {
        id: Date.now(),
        ...visibleCurrentShift,
        clockOut: new Date().toISOString(),
        status: "Submitted",
      },
      ...records,
    ]);

    setCurrentShift(null);
    setActiveTab("timesheet");
  };

  const startEditRecord = (record) => {
    setEditingRecordId(record.id);
    setEditClockIn(new Date(record.clockIn).toTimeString().slice(0, 5));
    setEditClockOut(record.clockOut ? new Date(record.clockOut).toTimeString().slice(0, 5) : "");
  };

  const saveEditedRecord = (record) => {
    if (!editClockIn || !editClockOut) return;

    const baseDate = new Date(record.clockIn).toISOString().slice(0, 10);
    const newClockIn = new Date(`${baseDate}T${editClockIn}:00`).toISOString();
    const newClockOut = new Date(`${baseDate}T${editClockOut}:00`).toISOString();

    setRecords(records.map((item) =>
      item.id === record.id
        ? {
            ...item,
            originalClockIn: item.originalClockIn || item.clockIn,
            originalClockOut: item.originalClockOut || item.clockOut,
            clockIn: newClockIn,
            clockOut: newClockOut,
            edited: true,
            status: "Admin Approval Required",
          }
        : item
    ));

    setEditingRecordId(null);
    setEditClockIn("");
    setEditClockOut("");
  };

  const cancelEditRecord = () => {
    setEditingRecordId(null);
    setEditClockIn("");
    setEditClockOut("");
  };

  const renderTimesheetCard = (record, allowEdit = true) => (
    <div key={record.id} className="rounded-2xl border bg-white p-4">
      <div className="flex justify-between gap-3">
        <div>
          <p className="font-semibold">{record.employee}</p>
          <p className="text-xs text-slate-600">{record.project}</p>
          <p className="text-xs text-slate-500">Cost Centre: {record.costCenter || "Not selected"}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs h-fit ${record.status === "Admin Approval Required" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
          {record.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-xs text-slate-600">
        <div>
          <p>Hours</p>
          <p className="font-semibold text-slate-900">{formatDuration(getWorkedMinutes(record))}</p>
        </div>
        <div>
          <p>Rate</p>
          <p className="font-semibold text-slate-900">{formatMoney(record.hourlyRate || 0)}/hr</p>
        </div>
        <div>
          <p>Total Cost</p>
          <p className="font-semibold text-slate-900">{formatMoney(getLabourCost(record))}</p>
        </div>
      </div>

      {editingRecordId === record.id ? (
        <div className="mt-3 border-t pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500">Edit In</label>
              <input
                type="time"
                className="w-full rounded-xl border p-2 text-sm"
                value={editClockIn}
                onChange={(event) => setEditClockIn(event.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Edit Out</label>
              <input
                type="time"
                className="w-full rounded-xl border p-2 text-sm"
                value={editClockOut}
                onChange={(event) => setEditClockOut(event.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button className="rounded-xl h-10 text-xs" onClick={() => saveEditedRecord(record)}>
              Send for Approval
            </Button>
            <Button variant="outline" className="rounded-xl h-10 text-xs" onClick={cancelEditRecord}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-600 border-t pt-3">
            <div>
              <p>In</p>
              <p className="font-semibold text-slate-900">{formatTime(new Date(record.clockIn))}</p>
            </div>
            <div>
              <p>Out</p>
              <p className="font-semibold text-slate-900">{record.clockOut ? formatTime(new Date(record.clockOut)) : "—"}</p>
            </div>
          </div>
          {record.edited && (
            <p className="mt-2 text-xs text-red-600">Time edited by employee — waiting for admin approval.</p>
          )}
          {allowEdit && (
            <Button variant="outline" className="w-full rounded-xl h-10 text-xs mt-3" onClick={() => startEditRecord(record)}>
              ✏️ Edit Time
            </Button>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-neutral-950 flex justify-center text-slate-900">
      <div className="w-full max-w-sm h-screen bg-slate-50 shadow-2xl relative overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-28">
          <div
            
            
            className="rounded-3xl bg-white border shadow-sm p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Clock App</h1>
                <p className="text-sm text-slate-600 mt-1">{formatDate(new Date())}</p>
                <p className="text-xs text-slate-500 mt-1">Logged in as {selectedEmployee.name} • {selectedEmployee.role}</p>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl">⏱️</div>
            </div>
          </div>

          {activeTab === "clock" && !isInstalled && (
            <Card className="rounded-3xl border-blue-100 bg-blue-50 shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div>
                  <h2 className="font-bold">Install on Phone</h2>
                  <p className="text-sm text-slate-600">Add this PWA to the home screen and use it like an app.</p>
                </div>
                <Button onClick={handleInstallApp} className="w-full rounded-2xl h-12">
                  📲 Install App
                </Button>
                {!deferredPrompt && (
  <p className="text-xs text-slate-500">
    iPhone: Open in Safari → Tap Share → Add to Home Screen
    <br />
    Android: Tap ⋮ → Install App / Add to Home Screen
  </p>
)}
              </CardContent>
            </Card>
          )}

          {activeTab === "clock" && !visibleCurrentShift && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-2xl bg-slate-100 flex items-center justify-center text-xl">👷</div>
                  <div>
                    <h2 className="font-bold text-lg">Start Shift</h2>
                    <p className="text-xs text-slate-500">Choose worker, project and cost centre</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Logged In User</label>
                  <select
                    className="w-full rounded-2xl border bg-white p-3 text-sm"
                    value={selectedEmployeeId}
                    onChange={(event) => setSelectedEmployeeId(Number(event.target.value))}
                  >
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name} — {employee.role}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Project / Job Site</label>
                  <select
                    className="w-full rounded-2xl border bg-white p-3 text-sm"
                    value={projectId}
                    onChange={(event) => handleProjectChange(event.target.value)}
                  >
                    {adminProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Cost Centre</label>
                  <select
                    className="w-full rounded-2xl border bg-white p-3 text-sm"
                    value={costCenter}
                    onChange={(event) => setCostCenter(event.target.value)}
                  >
                    {selectedProject.costCenters.map((center) => (
                      <option key={center} value={center}>
                        {center}
                      </option>
                    ))}
                  </select>
                </div>

                <Button className="w-full rounded-2xl h-16 text-lg font-bold" onClick={handleClockIn}>
                  ✅ Clock In
                </Button>
              </CardContent>
            </Card>
          )}

          {activeTab === "clock" && visibleCurrentShift && (
            <Card className="rounded-3xl shadow-sm border-green-100 bg-green-50 h-[calc(100vh-160px)] flex flex-col">
              <CardContent className="p-3 flex flex-col h-full gap-2">
                <div>
                  <h2 className="font-bold text-lg">Active Shift</h2>
                  <p className="text-sm text-slate-700">{visibleCurrentShift.employee}</p>
                  <p className="text-xs text-slate-600">{visibleCurrentShift.project} • {visibleCurrentShift.costCenter}</p>
                  <p className="text-xs text-slate-500">Rate: {formatMoney(visibleCurrentShift.hourlyRate)}/hr</p>
                </div>

                <div className="text-center my-0">
                  <p className="text-xs text-slate-500">Live Timer</p>
                  <p className="text-6xl font-black tabular-nums mt-1">{formatTimer(liveSeconds)}</p>
                  <p className="text-xl font-bold mt-1 text-green-700">{formatMoney(liveEarnings)}</p>
                  <p className="text-[11px] text-slate-500 mt-0">Money earned</p>
                </div>

                {isChangingTask ? (
                  <div className="space-y-2">
                    <select
                      className="w-full rounded-2xl border p-2"
                      value={projectId}
                      onChange={(e) => handleProjectChange(e.target.value)}
                    >
                      {adminProjects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <select
                      className="w-full rounded-2xl border p-2"
                      value={costCenter}
                      onChange={(e) => setCostCenter(e.target.value)}
                    >
                      {selectedProject.costCenters.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <Button className="h-10" onClick={applyTaskChange}>Save</Button>
                      <Button variant="outline" className="h-10" onClick={() => setIsChangingTask(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                <div className="space-y-2 mt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <Button variant="outline" className="w-full rounded-2xl h-12" onClick={handleChangeTask}>
                      🔄 Change Task
                    </Button>
                    <Button variant="secondary" className="w-full rounded-2xl h-12 text-base" onClick={handleBreak}>
                      ☕ {!visibleCurrentShift.breakStart ? "Break" : !visibleCurrentShift.breakEnd ? "End Break" : "Done"}
                    </Button>
                  </div>
                  <Button className="w-full rounded-2xl h-12 text-base font-bold" onClick={handleClockOut}>
                    🚪 Clock Out
                  </Button>
                </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "timesheet" && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-bold text-lg">My Timesheet</h2>
                    <p className="text-xs text-slate-500">Only showing logged-in user's time</p>
                  </div>
                  <Button variant="outline" className="rounded-2xl h-10 text-xs">⬇️ CSV</Button>
                </div>

                <div className="space-y-3">
                  {visibleCurrentShift && (
                    <div className="rounded-2xl border bg-blue-50 p-4">
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="font-semibold">{visibleCurrentShift.employee}</p>
                          <p className="text-xs text-slate-600">{visibleCurrentShift.project}</p>
                          <p className="text-xs text-slate-500">Cost Centre: {visibleCurrentShift.costCenter}</p>
                          <p className="text-xs text-slate-500">Rate: {formatMoney(visibleCurrentShift.hourlyRate)}/hr</p>
                        </div>
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-700 h-fit">Active</span>
                      </div>
                      <p className="text-sm mt-3">In: {formatTime(new Date(visibleCurrentShift.clockIn))}</p>
                      <p className="text-2xl font-black tabular-nums mt-2">{formatTimer(liveSeconds)}</p>
                      <p className="text-sm font-semibold mt-1 text-green-700">Money Earned: {formatMoney(liveEarnings)}</p>
                    </div>
                  )}

                  {visibleRecords.length === 0 && !visibleCurrentShift && (
                    <p className="text-sm text-slate-500 text-center py-8">No timesheet records for this user yet.</p>
                  )}

                  {visibleRecords.map((record) => renderTimesheetCard(record, true))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "reports" && isAdmin && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div>
                  <h2 className="font-bold text-lg">Admin Reports</h2>
                  <p className="text-xs text-slate-500">Filter by time range</p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <select
                    className="w-full rounded-2xl border p-3 text-sm"
                    value={reportRange}
                    onChange={(e) => setReportRange(e.target.value)}
                  >
                    <option value="today">Today</option>
                    <option value="weekly">Last 7 Days</option>
                    <option value="monthly">This Month</option>
                    <option value="yearly">This Year</option>
                    <option value="custom">Custom</option>
                  </select>

                  <select
                    className="w-full rounded-2xl border p-3 text-sm"
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                  >
                    <option value="employee">Employee Report</option>
                    <option value="project">Project Wise Report</option>
                  </select>

                  {reportType === "employee" && (
                    <select
                      className="w-full rounded-2xl border p-3 text-sm"
                      value={reportEmployeeId}
                      onChange={(e) => setReportEmployeeId(e.target.value)}
                    >
                      <option value="all">All Employees</option>
                      {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.name}
                        </option>
                      ))}
                    </select>
                  )}

                  {reportType === "project" && (
                    <select
                      className="w-full rounded-2xl border p-3 text-sm"
                      value={reportProjectId}
                      onChange={(e) => setReportProjectId(e.target.value)}
                    >
                      <option value="all">All Projects</option>
                      {adminProjects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {reportRange === "custom" && (
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" className="border rounded-xl p-2" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                    <input type="date" className="border rounded-xl p-2" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-100 p-4">
                    <p className="text-xs text-slate-500">Total Hours</p>
                    <p className="text-xl font-bold">{formatDuration(reportTotalMinutes)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-100 p-4">
                    <p className="text-xs text-slate-500">Total Cost</p>
                    <p className="text-xl font-bold">{formatMoney(reportTotalCost)}</p>
                  </div>
                </div>

                <div className="rounded-2xl border bg-white overflow-hidden">
                  {reportType === "employee" ? (
                    <div>
                      <div className="grid grid-cols-4 gap-1 bg-slate-100 p-2 text-[11px] font-bold text-slate-600">
                        <div>Date</div>
                        <div>Project</div>
                        <div>Cost Center</div>
                        <div>Cost</div>
                      </div>
                      {employeeReportRows.map((row) => (
                        <div key={row.id} className="grid grid-cols-4 gap-1 border-t p-2 text-[11px]">
                          <div className="font-medium"><div className="leading-tight"><div>{row.date.day}</div><div className="text-[10px] text-slate-500">{row.date.fullDate}</div></div></div>
                          <div>{row.project}</div>
                          <div>{row.costCenter}</div>
                          <div className="font-semibold">{formatMoney(row.cost)}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div>
                      <div className="grid grid-cols-4 gap-1 bg-slate-100 p-2 text-[11px] font-bold text-slate-600">
                        <div>Date</div>
                        <div>Cost Center</div>
                        <div>Hours</div>
                        <div>Cost</div>
                      </div>
                      {projectReportRows.map((row) => (
                        <div key={row.key} className="grid grid-cols-4 gap-1 border-t p-2 text-[11px]">
                          <div className="font-medium"><div className="leading-tight"><div>{row.date.day}</div><div className="text-[10px] text-slate-500">{row.date.fullDate}</div></div></div>
                          <div>{row.costCenter}</div>
                          <div>{formatDuration(row.minutes)}</div>
                          <div className="font-semibold">{formatMoney(row.cost)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm border-t bg-white/95 backdrop-blur px-3 py-2 z-50 shadow-lg">
          <div className={`grid ${isAdmin ? "grid-cols-3" : "grid-cols-2"} gap-2`}>
            <button
              onClick={() => setActiveTab("clock")}
              className={`rounded-2xl p-3 text-sm font-semibold ${activeTab === "clock" ? "bg-slate-900 text-white" : "text-slate-500"}`}
            >
              ⏱ Clock
            </button>
            <button
              onClick={() => setActiveTab("timesheet")}
              className={`rounded-2xl p-3 text-sm font-semibold ${activeTab === "timesheet" ? "bg-slate-900 text-white" : "text-slate-500"}`}
            >
              📄 Timesheet
            </button>
            {isAdmin && (
              <button
                onClick={() => setActiveTab("reports")}
                className={`rounded-2xl p-3 text-sm font-semibold ${activeTab === "reports" ? "bg-slate-900 text-white" : "text-slate-500"}`}
              >
                📊 Reports
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
