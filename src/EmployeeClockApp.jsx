import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

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

function formatLocation(location) {
  if (!location) return "Location not captured";
  return `${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)}`;
}

function getProjectFolderName(projectName) {
  return projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function getCurrentLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString(),
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 3000,
        maximumAge: 0,
      }
    );
  });
}

function openMap(location) {
  if (!location) return;
  window.open(`https://www.google.com/maps?q=${location.latitude},${location.longitude}`, "_blank");
}



function getErrorMessage(error) {
  if (!error) return "Unknown error";

  if (typeof error === "string") return error;

  if (error.message) return error.message;

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

function showErrorPopup(title, error) {
  const message = getErrorMessage(error);
  console.error(title, error);
  alert(`${title}\n\n${message}`);
}

function withTimeout(promise, ms = 10000, message = "Operation timed out") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

export default function EmployeeClockApp() {
  const [activeTab, setActiveTab] = useState("clock");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(1);
  const [projectId, setProjectId] = useState(adminProjects[0].id);
  const [costCenter, setCostCenter] = useState(adminProjects[0].costCenters[0]);
  const [currentShift, setCurrentShift] = useState(() => safeRead("orp_current_shift", null));
  const [records, setRecords] = useState(() => safeRead("orp_timesheet_records", sampleRecords));
  const [projectPhotos, setProjectPhotos] = useState(() => safeRead("orp_project_photos", {}));
  const [projectReceipts, setProjectReceipts] = useState(() => safeRead("orp_project_receipts", {}));
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
  const [locationStatus, setLocationStatus] = useState("");
  const [photoStatus, setPhotoStatus] = useState("");
const [uploadProgress, setUploadProgress] = useState(null);
  const [watchId, setWatchId] = useState(null);
  const [photoNotificationCount, setPhotoNotificationCount] = useState(() => safeRead("orp_photo_notification_count", 0));
  const [selectedPhotoFolder, setSelectedPhotoFolder] = useState("all");
  const [selectedReceiptFolder, setSelectedReceiptFolder] = useState("all");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [authLoading, setAuthLoading] = useState(false);
  const [authUser, setAuthUser] = useState(null);
  const [authRole, setAuthRole] = useState(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

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
      if (reportRange === "today") return date.toDateString() === nowDate.toDateString();
      if (reportRange === "weekly") {
        const weekAgo = new Date();
        weekAgo.setDate(nowDate.getDate() - 7);
        return date >= weekAgo;
      }
      if (reportRange === "monthly") return date.getMonth() === nowDate.getMonth() && date.getFullYear() === nowDate.getFullYear();
      if (reportRange === "yearly") return date.getFullYear() === nowDate.getFullYear();
      if (reportRange === "custom" && customFrom && customTo) return date >= new Date(customFrom) && date <= new Date(customTo);
      return true;
    });
  };

  const filteredRecords = filterRecordsByRange();

  const reportScopedRecords = filteredRecords.filter((record) => {
    if (reportType === "employee" && reportEmployeeId !== "all") return record.employeeId === Number(reportEmployeeId);
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

  const photoFolders = Object.keys(projectPhotos);
  const visiblePhotoFolders = selectedPhotoFolder === "all" ? photoFolders : photoFolders.filter((folder) => folder === selectedPhotoFolder);
  const receiptFolders = Object.keys(projectReceipts);
  const visibleReceiptFolders = selectedReceiptFolder === "all" ? receiptFolders : receiptFolders.filter((folder) => folder === selectedReceiptFolder);
  const receiptTotal = visibleReceiptFolders.reduce((total, folder) => {
    return total + (projectReceipts[folder] || []).reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
  }, 0);

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
    localStorage.setItem("orp_project_photos", JSON.stringify(projectPhotos));
  }, [projectPhotos]);

  useEffect(() => {
    localStorage.setItem("orp_project_receipts", JSON.stringify(projectReceipts));
  }, [projectReceipts]);

  useEffect(() => {
    localStorage.setItem("orp_photo_notification_count", JSON.stringify(photoNotificationCount));
  }, [photoNotificationCount]);

  useEffect(() => {
    if (!isAdmin && activeTab === "reports") setActiveTab("clock");
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

    if (window.matchMedia("(display-mode: standalone)").matches) setIsInstalled(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

const loadSession = async () => {
  try {
    console.log("Checking session...");

    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.log("Session error:", error);
    }

    const user = data?.session?.user || null;

    console.log("User:", user);

    setAuthUser(user);

    if (user) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError) {
        console.log("Profile error:", profileError);
      }

      setAuthRole(profile?.role || "employee");
    }

  } catch (err) {
    console.log("CRITICAL AUTH ERROR:", err);
  } finally {
    console.log("Auth finished");
    setAuthLoading(false); // 🔥 ALWAYS RUN
  }
};
    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user || null;
      setAuthUser(user);

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        setAuthRole(profile?.role || "employee");
      } else {
        setAuthRole(null);
        setCurrentShift(null);
      }

      setAuthLoading(false);
    });

    return () => {
      isMounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });

    if (error) {
      setLoginError(error.message);
      setLoginLoading(false);
      return;
    }

    const user = data?.user || null;
    setAuthUser(user);

    if (user) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError) {
        setLoginError(profileError.message);
        setLoginLoading(false);
        return;
      }

      setAuthRole(profile?.role || "employee");
    }

    setLoginLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setAuthUser(null);
    setAuthRole(null);
    setCurrentShift(null);
    setIsMenuOpen(false);
  };

  const liveSeconds = useMemo(() => {
    if (!visibleCurrentShift) return 0;
    const totalSeconds = Math.max(0, Math.floor((now - new Date(visibleCurrentShift.clockIn)) / 1000));
    const activeBreakSeconds = visibleCurrentShift.breakStart && !visibleCurrentShift.breakEnd
      ? Math.max(0, Math.floor((now - new Date(visibleCurrentShift.breakStart)) / 1000))
      : 0;
    return Math.max(0, totalSeconds - activeBreakSeconds);
  }, [visibleCurrentShift, now]);

  const liveEarnings = visibleCurrentShift ? (liveSeconds / 3600) * Number(visibleCurrentShift.hourlyRate || 0) : 0;

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
    if (isIOS && isSafari) return "iPhone: Tap the Share button → Add to Home Screen.";
    if (isIOS && !isSafari) return "iPhone: Open this link in Safari, then tap Share → Add to Home Screen.";
    if (isAndroid && isChrome) return "Android: Tap Chrome menu (⋮) → Install App or Add to Home Screen.";
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

  const startLiveLocationTracking = () => {
    if (!navigator.geolocation) {
      setLocationStatus("Live GPS not supported on this device");
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (position) => {
        const liveLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString(),
        };

        setCurrentShift((previousShift) => {
          if (!previousShift) return previousShift;
          return {
            ...previousShift,
            liveLocation,
            locationTrail: [...(previousShift.locationTrail || []), liveLocation].slice(-50),
          };
        });
      },
      () => setLocationStatus("Live GPS permission denied or unavailable"),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    setWatchId(id);
  };

const handleClockIn = async () => {
  setLocationStatus("Clocking in...");

  const clockInLocation = null;
  const clockInTime = new Date().toISOString();

  const newShift = {
    employeeId: selectedEmployee.id,
    employee: selectedEmployee.name,
    hourlyRate: selectedEmployee.hourlyRate,
    project: selectedProject.name,
    projectId: selectedProject.id,
    costCenter,
    date: clockInTime,
    clockIn: clockInTime,
    clockInLocation,
    breakStart: null,
    breakEnd: null,
    status: "Active",
    photosTaken: 0,
    lastPhotoAt: null,
    projectFolder: getProjectFolderName(selectedProject.name),
    liveLocation: null,
    locationTrail: [],
  };

  setCurrentShift(newShift);
  setLocationStatus("Clock-in saved locally.");

  if (!authUser) {
    alert("User not logged in");
    return;
  }

  const { data, error } = await supabase
    .from("timesheets")
    .insert([
      {
        user_id: authUser.id,
        employee_name: selectedEmployee.name,
        project_name: selectedProject.name,
        hourly_rate: selectedEmployee.hourlyRate,
        cost_centre: costCenter,
        clock_in: clockInTime,
        status: "Active",
        clock_in_latitude: null,
        clock_in_longitude: null,
      },
    ])
    .select();

  if (error) {
    console.log("Supabase clock-in error:", error);
    alert("Clock-in saved locally, but database save failed.");
    return;
  }

  setCurrentShift({ ...newShift, supabaseTimesheetId: data?.[0]?.id || null });
  setLocationStatus("Clock-in saved.");
};
  const handleChangeTask = () => {
    if (!visibleCurrentShift) return;
    setIsChangingTask(true);
  };

  const applyTaskChange = () => {
    if (!visibleCurrentShift) return;
    const updatedProject = adminProjects.find((p) => p.id === projectId) || adminProjects[0];
    setCurrentShift({
      ...visibleCurrentShift,
      project: updatedProject.name,
      projectId: updatedProject.id,
      costCenter,
      projectFolder: getProjectFolderName(updatedProject.name),
    });
    setIsChangingTask(false);
  };

  const handleBreak = () => {
    if (!visibleCurrentShift) return;
    if (!visibleCurrentShift.breakStart) {
      setCurrentShift({ ...visibleCurrentShift, breakStart: new Date().toISOString() });
      return;
    }
    if (!visibleCurrentShift.breakEnd) setCurrentShift({ ...visibleCurrentShift, breakEnd: new Date().toISOString() });
  };


const compressImage = (file, maxWidth = 1000, quality = 0.6) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (event) => {
      img.src = event.target.result;
    };

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(maxWidth / img.width, 1);

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Image compression failed"));
            return;
          }

          const compressedFile = new File(
            [blob],
            file.name.replace(/\.[^/.]+$/, ".jpg"),
            { type: "image/jpeg" }
          );

          resolve(compressedFile);
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = reject;
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const handlePhotoCapture = async (event) => {
  const file = event.target.files?.[0];
  if (!file || !visibleCurrentShift || !authUser) return;

  const folderName = getProjectFolderName(visibleCurrentShift.project);

  try {
    setPhotoStatus("Compressing photo...");
    setUploadProgress(10);

    const compressedFile = await compressImage(file, 700, 0.45);

    console.log("Original size:", file.size);
    console.log("Compressed size:", compressedFile.size);

    setPhotoStatus(`Uploading small photo... ${Math.round(compressedFile.size / 1024)} KB`);
    setUploadProgress(30);

    const filePath = `${folderName}/${authUser.id}-${Date.now()}.jpg`;

    const uploadPromise = supabase.storage
      .from("project-photos")
      .upload(filePath, compressedFile, {
        cacheControl: "3600",
        upsert: false,
        contentType: "image/jpeg",
      });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Cloud upload timed out after 60 seconds")), 60000)
    );

    let progressTimer = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev === null) return 30;
        if (prev >= 95) return 95;
        return prev + 5;
      });
    }, 2000);

    const result = await Promise.race([uploadPromise, timeoutPromise]);

    clearInterval(progressTimer);

    if (result.error) {
      console.log("Cloud upload error:", result.error);
      showErrorPopup("Cloud upload failed", result.error);
      setPhotoStatus("Cloud upload failed.");
      setUploadProgress(null);
      event.target.value = "";
      return;
    }

    const { data } = supabase.storage
      .from("project-photos")
      .getPublicUrl(filePath);

    const photoUrl = data?.publicUrl || "";

    const photo = {
      id: Date.now(),
      project: visibleCurrentShift.project,
      folderName,
      costCenter: visibleCurrentShift.costCenter,
      employee: visibleCurrentShift.employee,
      employeeId: visibleCurrentShift.employeeId,
      capturedAt: new Date().toISOString(),
      location: null,
      dataUrl: "",
      imageUrl: photoUrl,
      type: "photo",
    };

    setProjectPhotos((previous) => ({
      ...previous,
      [folderName]: [photo, ...(previous[folderName] || [])],
    }));

    setPhotoNotificationCount((count) => count + 1);

    setCurrentShift((previousShift) =>
      previousShift
        ? {
            ...previousShift,
            photosTaken: (previousShift.photosTaken || 0) + 1,
            lastPhotoAt: photo.capturedAt,
          }
        : previousShift
    );

    setUploadProgress(100);
    setPhotoStatus("Photo uploaded ✅");

    setTimeout(() => {
      setUploadProgress(null);
    }, 1500);

    event.target.value = "";
  } catch (err) {
    console.log("Photo upload failed:", err);
    showErrorPopup("Photo upload failed", err);
    setPhotoStatus("Photo upload failed.");
    setUploadProgress(null);
    event.target.value = "";
  }
};
  const handleReceiptCapture = (event) => {
    const file = event.target.files?.[0];
    if (!file || !visibleCurrentShift) return;

    const amountInput = window.prompt("Enter receipt amount:");
    const amount = Number(amountInput || 0);
    const category = window.prompt("Receipt category? Example: Materials, Fuel, Tools, Parking, Other") || "Other";
    const note = window.prompt("Optional note for this receipt:") || "";

    const reader = new FileReader();
    reader.onload = () => {
      const folderName = getProjectFolderName(visibleCurrentShift.project);
      const receipt = {
        id: Date.now(),
        project: visibleCurrentShift.project,
        folderName,
        costCenter: visibleCurrentShift.costCenter,
        employee: visibleCurrentShift.employee,
        employeeId: visibleCurrentShift.employeeId,
        amount: Number.isFinite(amount) ? amount : 0,
        category,
        note,
        capturedAt: new Date().toISOString(),
        location: visibleCurrentShift.liveLocation || visibleCurrentShift.clockInLocation || null,
        dataUrl: reader.result,
        type: "receipt",
      };

      setProjectReceipts((previous) => ({ ...previous, [folderName]: [receipt, ...(previous[folderName] || [])] }));
      setPhotoStatus(`Receipt saved: ${formatMoney(receipt.amount)}`);
      event.target.value = "";
    };
    reader.readAsDataURL(file);
  };

  const handleClockOut = async () => {
    if (!visibleCurrentShift) return;

    if (!visibleCurrentShift.photosTaken || visibleCurrentShift.photosTaken < 1) {
      alert("Please take at least one final project picture before clocking out.");
      return;
    }

    if (watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }

    setLocationStatus("Getting clock-out location...");
    const clockOutLocation = await getCurrentLocation();
    const clockOutTime = new Date().toISOString();

    const completedRecord = {
      id: Date.now(),
      ...visibleCurrentShift,
      clockOut: clockOutTime,
      clockOutLocation,
      status: "Submitted",
    };

    if (visibleCurrentShift.supabaseTimesheetId) {
      const labourCost = getLabourCost(completedRecord);
      const { error } = await supabase
        .from("timesheets")
        .update({
          clock_out: clockOutTime,
          status: "Submitted",
          labour_cost: labourCost,
          clock_out_latitude: clockOutLocation?.latitude || null,
          clock_out_longitude: clockOutLocation?.longitude || null,
        })
        .eq("id", visibleCurrentShift.supabaseTimesheetId);

      if (error) console.log("Supabase clock-out error:", error);
    }

    setRecords([completedRecord, ...records]);
    setCurrentShift(null);
    setLocationStatus(clockOutLocation ? "Clock-out location captured" : "Clock-out saved. Location not available.");
 	setActiveTab("clock");
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

    setRecords(records.map((item) => item.id === record.id ? {
      ...item,
      originalClockIn: item.originalClockIn || item.clockIn,
      originalClockOut: item.originalClockOut || item.clockOut,
      clockIn: newClockIn,
      clockOut: newClockOut,
      edited: true,
      status: "Admin Approval Required",
    } : item));

    setEditingRecordId(null);
    setEditClockIn("");
    setEditClockOut("");
  };

  const cancelEditRecord = () => {
    setEditingRecordId(null);
    setEditClockIn("");
    setEditClockOut("");
  };

  const getFolderShareLink = (folderName) => `${window.location.origin}/photos/${folderName}`;

  const shareProjectFolder = async (folderName) => {
    const shareUrl = getFolderShareLink(folderName);
    if (navigator.share) {
      await navigator.share({ title: "Project Photos", text: `Project photo folder: ${shareUrl}`, url: shareUrl });
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    alert("Project folder link copied. After Supabase setup, this will become a real customer share link.");
  };

  const openPhotosTab = () => {
    setActiveTab("photos");
    setPhotoNotificationCount(0);
    setIsMenuOpen(false);
  };

  const openMenuTab = (tabName) => {
    setActiveTab(tabName);
    if (tabName === "photos") setPhotoNotificationCount(0);
    setIsMenuOpen(false);
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
        <div><p>Hours</p><p className="font-semibold text-slate-900">{formatDuration(getWorkedMinutes(record))}</p></div>
        <div><p>Rate</p><p className="font-semibold text-slate-900">{formatMoney(record.hourlyRate || 0)}/hr</p></div>
        <div><p>Total Cost</p><p className="font-semibold text-slate-900">{formatMoney(getLabourCost(record))}</p></div>
      </div>

      {editingRecordId === record.id ? (
        <div className="mt-3 border-t pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500">Edit In</label>
              <input type="time" className="w-full rounded-xl border p-2 text-sm" value={editClockIn} onChange={(event) => setEditClockIn(event.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-500">Edit Out</label>
              <input type="time" className="w-full rounded-xl border p-2 text-sm" value={editClockOut} onChange={(event) => setEditClockOut(event.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button className="rounded-xl h-10 text-xs" onClick={() => saveEditedRecord(record)}>Send for Approval</Button>
            <Button className="rounded-xl h-10 text-xs" onClick={cancelEditRecord}>Cancel</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-600 border-t pt-3">
            <div><p>In</p><p className="font-semibold text-slate-900">{formatTime(new Date(record.clockIn))}</p></div>
            <div><p>Out</p><p className="font-semibold text-slate-900">{record.clockOut ? formatTime(new Date(record.clockOut)) : "—"}</p></div>
          </div>
          {record.edited && <p className="mt-2 text-xs text-red-600">Time edited by employee — waiting for admin approval.</p>}
          {allowEdit && <Button className="w-full rounded-xl h-10 text-xs mt-3" onClick={() => startEditRecord(record)}>✏️ Edit Time</Button>}
        </>
      )}
    </div>
  );

  if (authLoading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
        <div className="text-center">
          <div className="text-4xl mb-3">⏱️</div>
          <p className="text-sm text-slate-300">Loading Clock App...</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-neutral-950 flex justify-center items-center text-slate-900 p-4">
        <div className="w-full max-w-sm bg-slate-50 rounded-3xl shadow-2xl overflow-hidden">
          <div className="bg-white border-b p-5">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl">⏱️</div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Clock App</h1>
                <p className="text-sm text-slate-600">Ottawa Renovation Pro LTD</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleLogin} className="p-5 space-y-4">
            <div>
              <h2 className="text-xl font-bold">Login</h2>
              <p className="text-sm text-slate-500 mt-1">Enter your employee email and password.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                className="w-full rounded-2xl border bg-white p-3 text-sm"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                placeholder="employee@email.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <input
                type="password"
                className="w-full rounded-2xl border bg-white p-3 text-sm"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                required
              />
            </div>

            {loginError && (
              <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-sm text-red-700">
                {loginError}
              </div>
            )}

            <Button type="submit" className="w-full rounded-2xl h-14 text-base font-bold" disabled={loginLoading}>
              {loginLoading ? "Logging in..." : "Login"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex justify-center text-slate-900">
      <div className="w-full max-w-sm h-screen bg-slate-50 shadow-2xl relative overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-28">
          <div className="rounded-3xl bg-white border shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <button onClick={() => setIsMenuOpen(true)} className="h-11 w-11 rounded-2xl bg-slate-100 flex items-center justify-center text-xl">☰</button>
              <div className="flex-1">
                <h1 className="text-2xl font-bold tracking-tight">Clock App</h1>
                <p className="text-sm text-slate-600 mt-1">{formatDate(new Date())}</p>
                <p className="text-xs text-slate-500 mt-1">Logged in as {selectedEmployee.name} • {selectedEmployee.role}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Account: {authUser.email} • {authRole || "employee"}</p>
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
                <Button onClick={handleInstallApp} className="w-full rounded-2xl h-12">📲 Install App</Button>
                {!deferredPrompt && (
                  <p className="text-xs text-slate-500">
                    iPhone: Open in Safari → Tap Share → Add to Home Screen<br />
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
                  <select className="w-full rounded-2xl border bg-white p-3 text-sm" value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(Number(event.target.value))}>
                    {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} — {employee.role}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Project / Job Site</label>
                  <select className="w-full rounded-2xl border bg-white p-3 text-sm" value={projectId} onChange={(event) => handleProjectChange(event.target.value)}>
                    {adminProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Cost Centre</label>
                  <select className="w-full rounded-2xl border bg-white p-3 text-sm" value={costCenter} onChange={(event) => setCostCenter(event.target.value)}>
                    {selectedProject.costCenters.map((center) => <option key={center} value={center}>{center}</option>)}
                  </select>
                </div>

                <Button className="w-full rounded-2xl h-16 text-lg font-bold" onClick={handleClockIn}>✅ Clock In</Button>
                {locationStatus && <p className="text-xs text-slate-500 text-center">{locationStatus}</p>}
              </CardContent>
            </Card>
          )}

          {activeTab === "clock" && visibleCurrentShift && (
            <Card className="rounded-3xl shadow-sm border-green-100 bg-green-50">
              <CardContent className="p-3 flex flex-col gap-3">
                <div>
                  <h2 className="font-bold text-lg">Active Shift</h2>
                  <p className="text-sm text-slate-700">{visibleCurrentShift.employee}</p>
                  <p className="text-xs text-slate-600">{visibleCurrentShift.project} • {visibleCurrentShift.costCenter}</p>
                  <p className="text-xs text-slate-500">Rate: {formatMoney(visibleCurrentShift.hourlyRate)}/hr</p>
                  <p className="text-xs text-slate-500">Project Folder: {visibleCurrentShift.projectFolder}</p>
                  <p className="text-xs text-slate-500">Photos Today: {visibleCurrentShift.photosTaken || 0}</p>
                </div>

                <div className="text-center py-1">
                  <p className="text-xs text-slate-500">Live Timer</p>
                  <p className="text-6xl font-black tabular-nums leading-none mt-1">{formatTimer(liveSeconds)}</p>
                  <p className="text-xl font-bold mt-1 text-green-700">{formatMoney(liveEarnings)}</p>
                  <p className="text-[11px] text-slate-500">Money earned</p>
                </div>

                {isChangingTask ? (
                  <div className="space-y-2">
                    <select className="w-full rounded-2xl border p-2" value={projectId} onChange={(e) => handleProjectChange(e.target.value)}>
                      {adminProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <select className="w-full rounded-2xl border p-2" value={costCenter} onChange={(e) => setCostCenter(e.target.value)}>
                      {selectedProject.costCenters.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <Button className="h-10 rounded-xl" onClick={applyTaskChange}>Save</Button>
                      <Button className="h-10 rounded-xl" onClick={() => setIsChangingTask(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block w-full rounded-2xl h-10 bg-slate-900 text-white text-center leading-10 text-sm font-semibold cursor-pointer">
                        📷 Photo
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoCapture} />
                      </label>
                      <label className="block w-full rounded-2xl h-10 bg-green-700 text-white text-center leading-10 text-sm font-semibold cursor-pointer">
                        🧾 Receipt
                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleReceiptCapture} />
                      </label>
                    </div>
                    {photoStatus && <p className="text-xs text-slate-500 text-center">{photoStatus}</p>}
{uploadProgress !== null && (
  <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
    <div
      className="bg-green-600 h-3 rounded-full transition-all"
      style={{ width: `${uploadProgress}%` }}
    />
  </div>
)}

{uploadProgress !== null && (
  <p className="text-xs text-center text-slate-500">{uploadProgress}%</p>
)}
                    <div className="grid grid-cols-2 gap-3">
                      <Button className="w-full rounded-2xl h-12" onClick={handleChangeTask}>🔄 Change Task</Button>
                      <Button className="w-full rounded-2xl h-12 text-base" onClick={handleBreak}>☕ {!visibleCurrentShift.breakStart ? "Break" : !visibleCurrentShift.breakEnd ? "End Break" : "Done"}</Button>
                    </div>
<Button
  className="w-full rounded-2xl h-10 text-sm"
  onClick={async () => {
    try {
      setPhotoStatus("Testing cloud upload...");

      const testFile = new Blob(["hello"], { type: "text/plain" });
      const filePath = `test/test-${Date.now()}.txt`;

      const result = await withTimeout(
        supabase.storage
          .from("project-photos")
          .upload(filePath, testFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: "text/plain",
          }),
        10000,
        "Supabase test upload timed out after 10 seconds"
      );

      if (result.error) {
        showErrorPopup("Test upload failed", result.error);
        setPhotoStatus("Test upload failed.");
        return;
      }

      alert("Test upload worked ✅");
      setPhotoStatus("Test upload worked ✅");
    } catch (err) {
      showErrorPopup("Test upload error", err);
      setPhotoStatus("Test upload failed.");
    }
  }}
>
  🧪 Test Cloud Upload
</Button>
                    <Button className="w-full rounded-2xl h-12 text-base font-bold" onClick={handleClockOut}>🚪 Clock Out</Button>
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
                          <p className="text-xs text-slate-500">Live GPS: {formatLocation(visibleCurrentShift.liveLocation)}</p>
                        </div>
                        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs text-blue-700 h-fit">Active</span>
                      </div>
                      <p className="text-sm mt-3">In: {formatTime(new Date(visibleCurrentShift.clockIn))}</p>
                      <p className="text-2xl font-black tabular-nums mt-2">{formatTimer(liveSeconds)}</p>
                      <p className="text-sm font-semibold mt-1 text-green-700">Money Earned: {formatMoney(liveEarnings)}</p>
                    </div>
                  )}
                  {visibleRecords.length === 0 && !visibleCurrentShift && <p className="text-sm text-slate-500 text-center py-8">No timesheet records for this user yet.</p>}
                  {visibleRecords.map((record) => renderTimesheetCard(record, true))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "photos" && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div>
                  <h2 className="font-bold text-lg">Project Photos</h2>
                  <p className="text-xs text-slate-500">Supervisor can view photos saved by employees</p>
                </div>
                <select className="w-full rounded-2xl border p-3 text-sm" value={selectedPhotoFolder} onChange={(event) => setSelectedPhotoFolder(event.target.value)}>
                  <option value="all">All Project Folders</option>
                  {photoFolders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
                </select>
                {photoFolders.length === 0 && <p className="text-sm text-slate-500 text-center py-8">No project photos yet.</p>}
                <div className="space-y-4">
                  {visiblePhotoFolders.map((folder) => (
                    <div key={folder} className="rounded-2xl border bg-white p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div><p className="font-semibold">{folder}</p><p className="text-xs text-slate-500">{(projectPhotos[folder] || []).length} photos</p></div>
                        <Button className="rounded-xl h-10 text-xs" onClick={() => shareProjectFolder(folder)}>Share Link</Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(projectPhotos[folder] || []).map((photo) => (
                          <div key={photo.id} className="rounded-xl overflow-hidden border bg-slate-50">
                            <img src={photo.imageUrl || photo.dataUrl} alt="Project" className="w-full h-28 object-cover" />
                            <div className="p-2 text-[10px] text-slate-600">
                              <p className="font-semibold">{photo.employee}</p>
                              <p>{photo.costCenter}</p>
                              <p>{formatDate(new Date(photo.capturedAt))}</p>
                              <button className="underline text-blue-700" onClick={() => openMap(photo.location)}>Map</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "receipts" && (
            <Card className="rounded-3xl shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div><h2 className="font-bold text-lg">Receipts</h2><p className="text-xs text-slate-500">Receipt photos and totals by project</p></div>
                <select className="w-full rounded-2xl border p-3 text-sm" value={selectedReceiptFolder} onChange={(event) => setSelectedReceiptFolder(event.target.value)}>
                  <option value="all">All Project Folders</option>
                  {receiptFolders.map((folder) => <option key={folder} value={folder}>{folder}</option>)}
                </select>
                <div className="rounded-2xl bg-slate-100 p-4"><p className="text-xs text-slate-500">Receipt Total</p><p className="text-2xl font-bold">{formatMoney(receiptTotal)}</p></div>
                {receiptFolders.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-8">No receipts captured yet.</p>
                )}
                <div className="space-y-4">
                  {visibleReceiptFolders.map((folder) => {
                    const folderReceipts = projectReceipts[folder] || [];
                    const folderTotal = folderReceipts.reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0);
                    return (
                      <div key={folder} className="rounded-2xl border bg-white p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div><p className="font-semibold">{folder}</p><p className="text-xs text-slate-500">{folderReceipts.length} receipts</p></div>
                          <p className="font-bold">{formatMoney(folderTotal)}</p>
                        </div>
                        <div className="space-y-3">
                          {folderReceipts.map((receipt) => (
                            <div key={receipt.id} className="rounded-xl border bg-slate-50 overflow-hidden">
                              <img src={receipt.dataUrl} alt="Receipt" className="w-full h-36 object-cover" />
                              <div className="p-3 text-xs text-slate-600 space-y-1">
                                <div className="flex justify-between"><p className="font-semibold">{receipt.category}</p><p className="font-bold text-slate-900">{formatMoney(receipt.amount)}</p></div>
                                <p>{receipt.employee} • {receipt.costCenter}</p>
                                <p>{formatDate(new Date(receipt.capturedAt))}</p>
                                {receipt.note && <p>Note: {receipt.note}</p>}
                                <button className="underline text-blue-700" onClick={() => openMap(receipt.location)}>Map</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {isMenuOpen && (
          <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setIsMenuOpen(false)}>
            <div className="h-full w-72 bg-white shadow-2xl p-4 space-y-4" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between">
                <div><h2 className="font-bold text-lg">Menu</h2><p className="text-xs text-slate-500">{selectedEmployee.name} • {selectedEmployee.role}</p></div>
                <button className="text-xl" onClick={() => setIsMenuOpen(false)}>×</button>
              </div>
              <div className="space-y-2">
                <button className="w-full text-left rounded-2xl p-3 bg-slate-100 font-semibold" onClick={() => openMenuTab("timesheet")}>📄 Timesheet</button>
                <button className="relative w-full text-left rounded-2xl p-3 bg-slate-100 font-semibold" onClick={openPhotosTab}>🖼 Photos {photoNotificationCount > 0 && <span className="ml-2 rounded-full bg-red-600 text-white text-[10px] px-2 py-0.5">{photoNotificationCount}</span>}</button>
                <button className="w-full text-left rounded-2xl p-3 bg-slate-100 font-semibold" onClick={() => openMenuTab("receipts")}>🧾 Receipts</button>
                <button className="w-full text-left rounded-2xl p-3 bg-red-50 text-red-700 font-semibold" onClick={handleLogout}>🚪 Logout</button>
                {isAdmin && <><button className="w-full text-left rounded-2xl p-3 bg-slate-100 font-semibold" onClick={() => openMenuTab("quotations")}>📝 Quotations</button><button className="w-full text-left rounded-2xl p-3 bg-slate-100 font-semibold" onClick={() => openMenuTab("reports")}>📊 Reports</button></>}
              </div>
            </div>
          </div>
        )}

        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm border-t bg-white/95 backdrop-blur px-3 py-2 z-50 shadow-lg">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setActiveTab("clock")} className={`rounded-2xl p-3 text-sm font-semibold ${activeTab === "clock" ? "bg-slate-900 text-white" : "text-slate-500"}`}>⏱ Clock</button>
            <button onClick={() => setActiveTab("timesheet")} className={`rounded-2xl p-3 text-sm font-semibold ${activeTab === "timesheet" ? "bg-slate-900 text-white" : "text-slate-500"}`}>📄 Timesheet</button>
          </div>
        </div>
      </div>
    </div>
  );
}
