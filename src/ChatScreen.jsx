import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import {
  enqueueLocalFirstQueueItem,
  readLocalFirstCacheEnvelope,
  readLocalFirstQueue,
  removeLocalFirstQueueItem,
  replaceLocalFirstQueueItem,
  writeLocalFirstCache,
} from "./lib/localFirstCache";
import {
  DEFAULT_COMPANY_TIME_ZONE,
  EmptyState,
  PageCard,
  buildChatListHierarchy,
  buildChatListItemFallbackKey,
  buildChatListItemMergeKey,
  buildChatTimelineRows,
  calendarDateKeyInTimeZone,
  compareChatCreatedAtAscending,
  formatChatTimelineLabel,
  getErrorMessage,
  getOperaApiUrl,
  makeAppCacheKey,
  makeAppQueueKey,
  mergeChatMessageCollections,
  normalizeChatListItemDraftText,
  parseChatListComposerItems,
  requestSendPushForNotificationIds,
  safeGetSession,
  synthesizeQueuedChatMessage,
} from "./EmployeeClockApp.jsx";

// Matches the app shell's max-w-sm column so the pinned chat keeps the same
// centered width instead of stretching edge-to-edge on wider screens.
const IMMERSIVE_CHAT_MAX_WIDTH = "24rem";

/**
 * Keep the immersive chat pinned to the *visual* viewport. The app shell is
 * locked to 100dvh (the keyboard-hidden height), so when the mobile keyboard
 * opens the shell is taller than what's visible and iOS scrolls the whole
 * document up to reveal the focused composer — dragging the chat header off the
 * top. Fixing the outer container to the visual viewport (top = offsetTop,
 * height = visualViewport.height) keeps the header + composer locked in the
 * visible area; only the message list (flex-1 overflow-y-auto) shrinks.
 *
 * The first ref is the "anchor" (outer container) that gets fixed + centered;
 * any remaining refs just track the height so nested flex children fill it.
 */
function useImmersiveViewportHeight(refs, isImmersivePane) {
  const isImmersiveRef = useRef(isImmersivePane);
  // Largest visible height seen (the no-keyboard height) — used to estimate the
  // keyboard's size on devices (iOS installed PWAs) that never shrink
  // visualViewport/innerHeight when the keyboard opens.
  const maxSeenHeightRef = useRef(0);

  // Best available "visible height above the keyboard". Uses the smaller of
  // innerHeight and visualViewport.height (either may reflect the keyboard),
  // and falls back to an estimate when a text field is focused but neither
  // shrank — so the composer is never left stranded behind the keyboard.
  const measureVisibleHeight = () => {
    const vv = window.visualViewport;
    const inner = window.innerHeight || 0;
    const candidates = [inner, vv?.height || 0].filter((n) => n > 0);
    const measured = candidates.length ? Math.min(...candidates) : inner;
    maxSeenHeightRef.current = Math.max(maxSeenHeightRef.current, measured, inner);
    const full = maxSeenHeightRef.current || measured;
    const el = typeof document !== "undefined" ? document.activeElement : null;
    const typing = el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && el.type !== "checkbox" && el.type !== "button"));
    // Only estimate on touch devices — a focused field on desktop has no
    // overlay keyboard, so shrinking there would wrongly cut the view.
    const coarsePointer =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(pointer: coarse)").matches
        : false;
    if (typing && coarsePointer && measured >= full - 40) {
      // Keyboard is up but the viewport didn't report it — estimate its height
      // (iPhone keyboard + accessory/suggestions ≈ 336px) so the composer and
      // last message sit above it. A slight gap is fine; being hidden is not.
      return Math.max(240, full - 336);
    }
    return measured;
  };

  const clearImmersiveStyles = () => {
    const [anchor, ...rest] = refs;
    if (anchor?.current) {
      const s = anchor.current.style;
      s.position = "";
      s.top = "";
      s.left = "";
      s.right = "";
      s.transform = "";
      s.width = "";
      s.maxWidth = "";
      s.height = "";
      s.minHeight = "";
      s.maxHeight = "";
      s.zIndex = "";
    }
    for (const ref of rest) {
      if (ref?.current) {
        ref.current.style.height = "";
        ref.current.style.minHeight = "";
        ref.current.style.maxHeight = "";
      }
    }
  };

  const applyImmersiveStyles = () => {
    const viewport = window.visualViewport;
    const height = measureVisibleHeight();
    const top = viewport?.offsetTop || 0;
    const px = `${height}px`;
    const [anchor, ...rest] = refs;
    if (anchor?.current) {
      const s = anchor.current.style;
      // Pin to the visible viewport, centered like the app's max-w-sm column.
      s.position = "fixed";
      s.top = `${top}px`;
      s.left = "50%";
      s.right = "auto";
      s.transform = "translateX(-50%)";
      s.width = "100%";
      s.maxWidth = IMMERSIVE_CHAT_MAX_WIDTH;
      // min-height must be set too — the container has a `min-h-full` class
      // (min-height:100%) that would otherwise override the reduced height and
      // keep it full-screen, leaving the composer behind the keyboard.
      s.height = px;
      s.minHeight = px;
      s.maxHeight = px;
      s.zIndex = "40";
    }
    for (const ref of rest) {
      if (ref?.current) {
        ref.current.style.height = px;
        ref.current.style.minHeight = px;
        ref.current.style.maxHeight = px;
      }
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const apply = () => {
      if (!isImmersiveRef.current) return;
      applyImmersiveStyles();
    };
    // iOS (especially an installed PWA) often fires the visualViewport resize
    // late or not at all when the keyboard opens, so the container stays at its
    // full height and the composer ends up behind the keyboard. Focus events
    // always fire — re-measure on them with staggered delays so we catch the
    // reduced height once the keyboard finishes animating.
    const reapply = () => {
      apply();
      window.setTimeout(apply, 100);
      window.setTimeout(apply, 250);
      window.setTimeout(apply, 500);
    };
    apply();
    const viewport = window.visualViewport;
    if (viewport) {
      viewport.addEventListener("resize", apply);
      viewport.addEventListener("scroll", apply);
    } else {
      window.addEventListener("resize", apply);
    }
    window.addEventListener("focusin", reapply);
    window.addEventListener("focusout", reapply);
    return () => {
      if (viewport) {
        viewport.removeEventListener("resize", apply);
        viewport.removeEventListener("scroll", apply);
      } else {
        window.removeEventListener("resize", apply);
      }
      window.removeEventListener("focusin", reapply);
      window.removeEventListener("focusout", reapply);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    isImmersiveRef.current = isImmersivePane;
    if (typeof window === "undefined") return;
    if (isImmersivePane) {
      applyImmersiveStyles();
    } else {
      clearImmersiveStyles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isImmersivePane]);
}

// Pending-work list subtasks can be tagged H / T / O. Each tag also surfaces
// the item in a live "smart list" (Home Depot / Tool / Other) for the chat —
// the SAME underlying item shown in two places, so ticking it anywhere keeps
// both in sync. The tag value is stored on chat_list_items.department (unused
// by pending_job lists otherwise), so no schema change is needed.
const CHAT_SUBTASK_CATEGORIES = [
  { key: "H", value: "Home Depot", short: "H", title: "Home Depot", emoji: "🏠" },
  { key: "T", value: "Tool", short: "T", title: "Tool", emoji: "🔧" },
  { key: "O", value: "Other", short: "O", title: "Other", emoji: "📦" },
];
const CHAT_SUBTASK_CATEGORY_VALUES = new Set(CHAT_SUBTASK_CATEGORIES.map((c) => c.value));

// Fallback ordering for Home Depot departments that don't yet have a confirmed
// aisle — roughly the store walk order. Departments with a confirmed aisle sort
// by aisle number first (ascending).
const HD_DEPT_DEFAULT_ORDER = [
  "Lumber", "Building Materials", "Millwork & Trim", "Drywall", "Insulation",
  "Doors & Windows", "Kitchen & Bath", "Flooring", "Paint", "Plumbing",
  "Electrical", "Hardware & Fasteners", "Tools", "Outdoor & Garden", "Cleaning", "Other",
];

function hdAisleNumber(aisleRaw) {
  if (!aisleRaw) return null;
  const n = parseInt(String(aisleRaw).replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

export default function ChatScreen({ active, authUser, userCompany, companyTimeZone, setInAppNotifications, onViewModeChange, onBack }) {
  const chatEmptyStateIcon = (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-8 8H8l-5 2 1.8-4.6A8 8 0 1 1 21 12Z" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
  const chatGridRef = useRef(null);
  const chatSectionRef = useRef(null);
  const [conversations, setConversations] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [composerOpen, setComposerOpen] = useState(null);
  const [groupName, setGroupName] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState([]);
  const [creatingChat, setCreatingChat] = useState(false);
  // Adding people to an existing group (any member can add; removal is manager-only).
  const [groupAddOpen, setGroupAddOpen] = useState(false);
  const [groupAddIds, setGroupAddIds] = useState([]);
  const [chatUploading, setChatUploading] = useState(false);
  const [chatLists, setChatLists] = useState([]);
  const [selectedChatListId, setSelectedChatListId] = useState("");
  const [listComposerOpen, setListComposerOpen] = useState(false);
  const [listTitle, setListTitle] = useState("");
  // List type + Home Depot store name for the composer.
  const [listType, setListType] = useState("other"); // "home_depot" | "pending_job" | "other"
  const [listStoreName, setListStoreName] = useState("");
  // AI-suggested Home Depot store locations for the company's city (dropdown).
  const [hdStoreOptions, setHdStoreOptions] = useState([]);
  const [hdStoresLoading, setHdStoresLoading] = useState(false);
  const [hdStoreSuggestLoading, setHdStoreSuggestLoading] = useState(false);
  // Inline store-name edit on an open Home Depot list.
  const [storeNameDraft, setStoreNameDraft] = useState(null);
  const [storeNameSaving, setStoreNameSaving] = useState(false);
  // Inline rename of an open list (null = not editing) + its type.
  const [listTitleDraft, setListTitleDraft] = useState(null);
  const [listTypeDraft, setListTypeDraft] = useState("other");
  const [listTitleSaving, setListTitleSaving] = useState(false);
  // Show/hide archived lists (toggled from the chat's "…" menu).
  const [showArchivedLists, setShowArchivedLists] = useState(false);
  const [archivedLists, setArchivedLists] = useState([]);
  // Open smart-list overlay: a category value ("Home Depot"/"Tool"/"Other") or null.
  const [smartCategoryView, setSmartCategoryView] = useState(null);
  // Home Depot store intelligence: department -> confirmed aisle for the list's store.
  const [hdAisleByDept, setHdAisleByDept] = useState({});
  const [hdClassifying, setHdClassifying] = useState(false);
  const [hdAisleEditDept, setHdAisleEditDept] = useState(null); // department currently getting its aisle confirmed
  const [hdAisleDraft, setHdAisleDraft] = useState("");
  const [hdLearnBusy, setHdLearnBusy] = useState(false);
  const hdClassifyGuardRef = useRef("");
  // Shared product catalog (learned exact names + prices) for autocomplete and
  // the gallery product picker. Loaded per company when a Home Depot list opens.
  const [hdCatalog, setHdCatalog] = useState([]);
  const [hdCaptureBusy, setHdCaptureBusy] = useState(""); // item id currently being photographed for AI read
  const [hdPickerOpen, setHdPickerOpen] = useState(false);
  const [hdPickerDept, setHdPickerDept] = useState("");
  const [hdPickerBusy, setHdPickerBusy] = useState(false);
  const [hdSuggestOpen, setHdSuggestOpen] = useState(false);
  const [listItemsText, setListItemsText] = useState("");
  const [listItemDraft, setListItemDraft] = useState("");
  // Press-and-hold drag to reorder top-level list items. dragOrder is the live
  // array of item ids while dragging (null when not). dragReorderRef holds the
  // transient gesture state; chatRowElsRef maps item id -> its DOM row so we can
  // find which row the finger is over.
  const [dragItemId, setDragItemId] = useState(null);
  const [dragOrder, setDragOrder] = useState(null);
  const dragReorderRef = useRef({ id: null, pointerId: null, order: [], timer: null, startY: 0 });
  const chatRowElsRef = useRef({});
  // Photo attach/capture on list items ("" idle, "new" while creating a photo
  // item, or an item id while attaching to that item).
  const [listPhotoBusy, setListPhotoBusy] = useState("");
  // Auto-open the camera when an item is ticked complete so the crew can snap an
  // instant photo. A single hidden capture input is triggered synchronously from
  // the checkbox tap (preserving the user gesture) and the photo attaches to the
  // item that was just completed.
  const tickCaptureInputRef = useRef(null);
  const tickCaptureItemRef = useRef(null);
  const [subItemDraft, setSubItemDraft] = useState("");
  const [addingSubItemParentId, setAddingSubItemParentId] = useState("");
  const [editingListItemId, setEditingListItemId] = useState("");
  const [editingListItemText, setEditingListItemText] = useState("");
  const [selectedChatListShowCompleted, setSelectedChatListShowCompleted] = useState(false);
  const [selectedChatListSnapshot, setSelectedChatListSnapshot] = useState(null);
  const [chatListFocusRestoreTick, setChatListFocusRestoreTick] = useState(0);
  const [assigningListItemId, setAssigningListItemId] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [chatSearch, setChatSearch] = useState("");
  const [chatFilter, setChatFilter] = useState("all");
  const [chatPane, setChatPane] = useState("list");
  const [chatUtilityMenuOpen, setChatUtilityMenuOpen] = useState(false);
  const [conversationMembers, setConversationMembers] = useState([]);
  const [chatReplyTarget, setChatReplyTarget] = useState(null);
  const [chatActiveMessage, setChatActiveMessage] = useState(null);
  const [chatForwardMessage, setChatForwardMessage] = useState(null);
  const [chatImageViewer, setChatImageViewer] = useState(null);
  const [chatForwardSearch, setChatForwardSearch] = useState("");
  const chatImageInputRef = useRef(null);
  const chatMessageInputRef = useRef(null);
  const chatListTitleInputRef = useRef(null);
  const chatListItemInputRef = useRef(null);
  const chatSubItemInputRef = useRef(null);
  const chatListEditInputRef = useRef(null);
  const chatListInputPointerAtRef = useRef(0);
  const chatSubItemInputPointerAtRef = useRef(0);
  const chatListSwipeStateRef = useRef({});
  const chatThreadScrollRef = useRef(null);
  const chatMessagePressTimerRef = useRef(null);
  const chatMessagePressTargetRef = useRef(null);
  const chatForwardSearchRef = useRef(null);
  const messagesRef = useRef([]);
  const chatListsRef = useRef([]);
  const conversationMembersRef = useRef([]);
  const [threadCacheHydrated, setThreadCacheHydrated] = useState(false);
  const isImmersivePane = chatPane !== "list";
  useImmersiveViewportHeight(
    useMemo(() => [chatGridRef, chatSectionRef], []),
    isImmersivePane
  );

  const companyId = userCompany?.id || "";
  const currentUserId = authUser?.id || "";
  const currentUserDisplayName = useMemo(
    () =>
      String(
        authUser?.user_metadata?.full_name ||
          authUser?.user_metadata?.name ||
          authUser?.user_metadata?.user_name ||
          authUser?.email ||
          "User"
      ).trim() || "User",
    [authUser]
  );
  const chatConversationsCacheKey = useMemo(
    () => makeAppCacheKey("chat", companyId || "company", currentUserId || "user", "conversations"),
    [companyId, currentUserId]
  );
  const chatMessagesCacheKey = useMemo(
    () => (selectedConversationId ? makeAppCacheKey("chat", companyId || "company", currentUserId || "user", "messages", selectedConversationId) : ""),
    [companyId, currentUserId, selectedConversationId]
  );
  const chatPendingQueueKey = useMemo(
    () => makeAppQueueKey("chat", companyId || "company", currentUserId || "user", "pending_messages"),
    [companyId, currentUserId]
  );
  const chatErrorMessage = useCallback((err) => {
    const message = getErrorMessage(err);
    return /failed to fetch/i.test(message)
      ? "Company chat is not connected in this local build yet."
      : message;
  }, []);

  const memberById = useMemo(
    () => Object.fromEntries((members || []).map((member) => [String(member.user_id), member])),
    [members]
  );
  const availableMembers = useMemo(
    () => members.filter((member) => String(member.user_id) !== String(currentUserId)),
    [currentUserId, members]
  );
  const conversationRows = useMemo(() => {
    const rows = [...(conversations || [])].sort((a, b) => {
      const aCompany = a?.type === "company" && a?.is_default;
      const bCompany = b?.type === "company" && b?.is_default;
      if (aCompany !== bCompany) return aCompany ? -1 : 1;
      if (Boolean(a?.pinned) !== Boolean(b?.pinned)) return a?.pinned ? -1 : 1;
      return String(b?.last_message_at || "").localeCompare(String(a?.last_message_at || ""));
    });
    const hasCompanyChat = rows.some((conversation) => conversation?.type === "company" && conversation?.is_default);
    if (!hasCompanyChat && companyId) {
      rows.unshift({
        id: "__company_all_employees__",
        type: "company",
        name: "All employees",
        is_default: true,
        last_message: "Company-wide chat",
        last_message_at: "",
        member_user_ids: members.map((member) => member.user_id).filter(Boolean),
        pendingSetup: true,
      });
    }
    return rows;
  }, [companyId, conversations, members]);
  const selectedConversation = useMemo(
    () =>
      conversationRows.find((conversation) => String(conversation.id) === String(selectedConversationId)) ||
      conversationRows[0] ||
      null,
    [conversationRows, selectedConversationId]
  );
  const selectedConversationMembers = useMemo(
    () =>
      (conversationMembers.length
        ? conversationMembers
        : (selectedConversation?.member_user_ids || []).map((userId) => ({
            user_id: userId,
            ...(memberById[String(userId)] || {}),
          }))),
    [conversationMembers, memberById, selectedConversation]
  );
  const selectedCanManage = Boolean(selectedConversation?.can_manage);
  const isRealGroupConversation =
    selectedConversation?.type === "group" && !selectedConversation?.is_default && !selectedConversation?.pendingSetup;
  // Company members not already in the current group — the candidates any group
  // member can add.
  const addableGroupMembers = useMemo(() => {
    const inGroup = new Set(selectedConversationMembers.map((m) => String(m.user_id)));
    return availableMembers.filter((m) => !inGroup.has(String(m.user_id)));
  }, [availableMembers, selectedConversationMembers]);
  const selectedCanLeave = Boolean(selectedConversation?.can_leave);
  const selectedCanArchive = Boolean(selectedConversation?.can_archive);
  const selectedChatList = useMemo(
    () => chatLists.find((list) => String(list.id) === String(selectedChatListId)) || null,
    [chatLists, selectedChatListId]
  );
  const selectedChatListResolved = selectedChatList || selectedChatListSnapshot || null;
  const selectedChatListItems = useMemo(() => {
    const rows = Array.isArray(selectedChatListResolved?.items) ? [...selectedChatListResolved.items] : [];
    rows.sort((a, b) => {
      const sortDiff = Number(a?.sort_order || 0) - Number(b?.sort_order || 0);
      if (sortDiff !== 0) return sortDiff;
      const levelDiff = Number(a?.item_level || 0) - Number(b?.item_level || 0);
      if (levelDiff !== 0) return levelDiff;
      const childDiff = Number(a?.child_order || 0) - Number(b?.child_order || 0);
      if (childDiff !== 0) return childDiff;
      return String(a?.created_at || "").localeCompare(String(b?.created_at || ""));
    });
    return rows;
  }, [selectedChatListResolved, selectedChatListShowCompleted]);
  const selectedChatListHierarchy = useMemo(
    () => buildChatListHierarchy(selectedChatListItems, { showCompleted: selectedChatListShowCompleted }),
    [selectedChatListItems, selectedChatListShowCompleted]
  );
  // Home Depot lists: group by department and order by confirmed aisle
  // (ascending), so the crew walks the store in order. Departments without a
  // known aisle fall back to a sensible walk order and sit after known aisles.
  const hdDisplayHierarchy = useMemo(() => {
    if (selectedChatListResolved?.list_type !== "home_depot") return selectedChatListHierarchy;
    const rank = (dept) => {
      const aisle = hdAisleNumber(hdAisleByDept[dept]);
      const order = HD_DEPT_DEFAULT_ORDER.indexOf(dept || "Other");
      return { aisle, order: order < 0 ? 99 : order };
    };
    return [...selectedChatListHierarchy].sort((a, b) => {
      const ra = rank(a.department || "Other");
      const rb = rank(b.department || "Other");
      if (ra.aisle != null && rb.aisle != null && ra.aisle !== rb.aisle) return ra.aisle - rb.aisle;
      if (ra.aisle != null && rb.aisle == null) return -1;
      if (ra.aisle == null && rb.aisle != null) return 1;
      if ((a.department || "Other") !== (b.department || "Other")) return ra.order - rb.order;
      return Number(a.item_number || 0) - Number(b.item_number || 0);
    });
  }, [selectedChatListHierarchy, selectedChatListResolved, hdAisleByDept]);
  const selectedChatAssignableMembers = useMemo(
    () =>
      (selectedConversationMembers.length ? selectedConversationMembers : members)
        .filter((member) => member?.user_id)
        .map((member) => ({
          user_id: String(member.user_id),
          name: String(member.name || member.email || "User").trim() || "User",
          email: String(member.email || "").trim(),
        })),
    [members, selectedConversationMembers]
  );
  const chatAssigneeById = useMemo(
    () => Object.fromEntries(selectedChatAssignableMembers.map((member) => [String(member.user_id), member])),
    [selectedChatAssignableMembers]
  );
  const getChatListAssigneeMeta = useCallback(
    (item) => {
      const assignedUserId = String(item?.assigned_user_id || "").trim();
      if (!assignedUserId) return null;
      const member = chatAssigneeById[assignedUserId] || memberById[assignedUserId] || null;
      if (!member) return { user_id: assignedUserId, name: "Assigned", initial: "A" };
      const label = String(member.name || member.email || "Assigned").trim() || "Assigned";
      return {
        user_id: assignedUserId,
        name: label,
        initial: label.slice(0, 1).toUpperCase(),
      };
    },
    [chatAssigneeById, memberById]
  );
  const chatTimelineRows = useMemo(() => buildChatTimelineRows(messages, []), [messages]);
  // O(1) lookup for the "replying to" message instead of a per-row Array.find,
  // which turned every ChatScreen render (e.g. one per composer keystroke)
  // into an O(n^2) scan of the whole message history.
  const messagesById = useMemo(() => {
    const map = new Map();
    for (const row of Array.isArray(messages) ? messages : []) {
      if (row && row.id != null) map.set(String(row.id), row);
    }
    return map;
  }, [messages]);
  const chatTimelineGroups = useMemo(() => {
    const groups = [];
    for (const entry of chatTimelineRows) {
      const dayKey = calendarDateKeyInTimeZone(entry?.created_at || new Date(), companyTimeZone);
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.dayKey !== dayKey) {
        groups.push({
          dayKey,
          label: formatChatTimelineLabel(dayKey, companyTimeZone),
          rows: [entry],
        });
      } else {
        lastGroup.rows.push(entry);
      }
    }
    return groups;
  }, [chatTimelineRows, companyTimeZone]);
  const selectedConversationSubtitle = useMemo(() => {
    if (!selectedConversation) return "";
    if (selectedConversation.pendingSetup) return "Setting up company chat";
    const memberNames = selectedConversationMembers
      .map((member) => {
        if (!member?.user_id) return "";
        if (String(member.user_id) === String(currentUserId)) return "You";
        return member.name || member.email || "User";
      })
      .filter(Boolean);
    if (selectedConversation.type === "direct") {
      return memberNames.find((name) => name !== "You") || "Direct message";
    }
    if (!memberNames.length) {
      return selectedConversation.type === "company" ? "Company-wide chat" : "Group chat";
    }
    if (memberNames.length <= 3) return memberNames.join(", ");
    return `${memberNames.slice(0, 3).join(", ")} +${memberNames.length - 3}`;
  }, [currentUserId, selectedConversation, selectedConversationMembers]);

  const resizeChatComposer = useCallback(() => {
    const input = chatMessageInputRef.current;
    if (!input) return;
    input.style.height = "auto";
    const nextHeight = Math.min(Math.max(input.scrollHeight, 20), 112);
    const nextHeightPx = `${nextHeight}px`;
    if (input.style.height !== nextHeightPx) input.style.height = nextHeightPx;
    input.style.overflowY = input.scrollHeight > nextHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    messagesRef.current = Array.isArray(messages) ? messages : [];
  }, [messages]);

  useEffect(() => {
    chatListsRef.current = Array.isArray(chatLists) ? chatLists : [];
  }, [chatLists]);

  useEffect(() => {
    conversationMembersRef.current = Array.isArray(conversationMembers) ? conversationMembers : [];
  }, [conversationMembers]);

  useEffect(() => {
    setChatUtilityMenuOpen(false);
  }, [chatPane, selectedConversationId]);

  useEffect(() => {
    if (typeof onViewModeChange !== "function") return undefined;
    onViewModeChange(chatPane);
  }, [chatPane, onViewModeChange]);

  useEffect(() => {
    if (typeof onViewModeChange !== "function") return undefined;
    return () => onViewModeChange("list");
  }, [onViewModeChange]);

  useLayoutEffect(() => {
    resizeChatComposer();
  }, [messageDraft, resizeChatComposer, selectedConversationId]);

  const openChatListDetail = useCallback((listId) => {
    setSelectedChatListId(String(listId || ""));
    setEditingListItemId("");
    setEditingListItemText("");
    setAssigningListItemId("");
    setListItemDraft("");
    setSelectedChatListShowCompleted(false);
    setChatPane("list-detail");
  }, []);

  const summarizeChatListItems = useCallback((items) => {
    const rows = Array.isArray(items) ? [...items] : [];
    rows.sort((left, right) => {
      const sortDiff = Number(left?.sort_order || 0) - Number(right?.sort_order || 0);
      if (sortDiff !== 0) return sortDiff;
      const levelDiff = Number(left?.item_level || 0) - Number(right?.item_level || 0);
      if (levelDiff !== 0) return levelDiff;
      const itemNumberDiff = Number(left?.item_number || 0) - Number(right?.item_number || 0);
      if (itemNumberDiff !== 0) return itemNumberDiff;
      const childOrderDiff = Number(left?.child_order || 0) - Number(right?.child_order || 0);
      if (childOrderDiff !== 0) return childOrderDiff;
      return String(left?.created_at || "").localeCompare(String(right?.created_at || ""));
    });
    const deduped = [];
    const byId = new Map();
    const byFallback = new Map();
    for (const row of rows) {
      const persistedId = String(row?.id || "").trim();
      const hasPersistedId = Boolean(persistedId && !persistedId.startsWith("temp-"));
      const fallbackKey = buildChatListItemFallbackKey(row);
      const existingIndex =
        (hasPersistedId && byId.has(persistedId) ? byId.get(persistedId) : null) ??
        (byFallback.has(fallbackKey) ? byFallback.get(fallbackKey) : null);
      if (existingIndex == null) {
        const nextIndex = deduped.push(row) - 1;
        if (hasPersistedId) byId.set(persistedId, nextIndex);
        byFallback.set(fallbackKey, nextIndex);
        continue;
      }
      const existing = deduped[existingIndex];
      const existingPersistedId = String(existing?.id || "").trim();
      const existingHasPersistedId = Boolean(existingPersistedId && !existingPersistedId.startsWith("temp-"));
      const preferredRow =
        hasPersistedId && !existingHasPersistedId
          ? { ...existing, ...row, __optimistic: false }
          : !hasPersistedId && existingHasPersistedId
            ? existing
            : row?.__optimistic && !existing?.__optimistic
              ? existing
              : { ...existing, ...row };
      deduped[existingIndex] = preferredRow;
      const preferredPersistedId = String(preferredRow?.id || "").trim();
      if (preferredPersistedId && !preferredPersistedId.startsWith("temp-")) {
        byId.set(preferredPersistedId, existingIndex);
      }
      byFallback.set(buildChatListItemFallbackKey(preferredRow), existingIndex);
    }
    return deduped;
  }, []);

  const summarizeChatListRow = useCallback(
    (list, items) => {
      const rows = summarizeChatListItems(items);
      return {
        ...list,
        pinned: false,
        items: rows,
        open_count: rows.filter((item) => !item.is_done).length,
        total_count: rows.length,
      };
    },
    [summarizeChatListItems]
  );

  const buildQueuedConversationMessages = useCallback(
    (conversationId) =>
      readLocalFirstQueue(chatPendingQueueKey, [])
        .filter((item) => String(item?.conversation_id || item?.conversationId || "") === String(conversationId || ""))
        .map((item) =>
          synthesizeQueuedChatMessage(
            {
              ...item,
              sender_user_id: item?.sender_user_id || item?.senderUserId || currentUserId,
            },
            currentUserDisplayName
          )
        ),
    [chatPendingQueueKey, currentUserDisplayName, currentUserId]
  );

  const mergeChatListsWithLocalState = useCallback(
    (remoteLists, localLists = chatListsRef.current) => {
      const remoteById = new Map((Array.isArray(remoteLists) ? remoteLists : []).map((list) => [String(list?.id || ""), list]));
      const localById = new Map((Array.isArray(localLists) ? localLists : []).map((list) => [String(list?.id || ""), list]));
      const mergedIds = new Set([...remoteById.keys(), ...localById.keys()].filter(Boolean));
      return [...mergedIds]
        .map((listId) => {
          const remoteList = remoteById.get(listId) || null;
          const localList = localById.get(listId) || null;
          const baseList = remoteList || localList;
          if (!baseList) return null;
          // A real (persisted) list the server no longer returns has been
          // archived or deleted — drop it instead of resurrecting it from the
          // local cache into the ribbon. Only keep local-only lists that are
          // still optimistic (a freshly-created list awaiting its server id).
          if (!remoteList) {
            const localId = String(localList?.id || "");
            const isOptimistic = Boolean(localList?.__optimistic) || localId.startsWith("temp-");
            if (!isOptimistic) return null;
          }
          const remoteItems = Array.isArray(remoteList?.items) ? remoteList.items : [];
          const localItems = Array.isArray(localList?.items) ? localList.items : [];
          const mergedItems = [...remoteItems];
          const knownItemKeys = new Set(remoteItems.map((item) => buildChatListItemMergeKey(item)));
          for (const item of localItems) {
            const itemKey = buildChatListItemMergeKey(item);
            if (item?.__optimistic && !knownItemKeys.has(itemKey)) {
              mergedItems.push(item);
              knownItemKeys.add(itemKey);
            }
          }
          return summarizeChatListRow(
            {
              ...baseList,
              pinned: false,
            },
            mergedItems
          );
        })
        .filter(Boolean)
        .sort((a, b) => compareChatCreatedAtAscending(a?.created_at, b?.created_at));
    },
    [summarizeChatListRow]
  );

  const mergeChatMessagesWithLocalState = useCallback(
    (remoteMessages, conversationId, localMessages = messagesRef.current) =>
      mergeChatMessageCollections({
        remoteMessages,
        localMessages,
        queuedMessages: buildQueuedConversationMessages(conversationId),
      }),
    [buildQueuedConversationMessages]
  );

  const scrollChatThreadToBottom = useCallback((behavior = "auto") => {
    const node = chatThreadScrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);

  const restoreChatListInputFocus = useCallback(() => {
    const focusInput = () => {
      const input = chatListItemInputRef.current;
      if (!input) return;
      input.focus?.();
      const valueLength = String(input.value || "").length;
      input.setSelectionRange?.(valueLength, valueLength);
    };
    focusInput();
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => focusInput());
      window.setTimeout(() => focusInput(), 80);
      window.setTimeout(() => focusInput(), 220);
    }
    setChatListFocusRestoreTick((tick) => tick + 1);
  }, []);

  const restoreChatSubItemInputFocus = useCallback(() => {
    const focusInput = () => {
      const input = chatSubItemInputRef.current;
      if (!input) return;
      input.focus?.();
      const valueLength = String(input.value || "").length;
      input.setSelectionRange?.(valueLength, valueLength);
    };
    focusInput();
    if (typeof window !== "undefined") {
      requestAnimationFrame(() => focusInput());
      window.setTimeout(() => focusInput(), 80);
      window.setTimeout(() => focusInput(), 220);
    }
  }, []);

  const shouldPreserveTouchedInputFocus = useCallback((lastPointerAt) => Date.now() - Number(lastPointerAt || 0) < 500, []);

  const updateSelectedChatListRows = useCallback(
    (updater) => {
      setChatLists((previous) =>
        previous.map((list) => {
          if (String(list.id) !== String(selectedChatListId)) return list;
          const currentRows = Array.isArray(list.items) ? list.items : [];
          const nextRows = updater(currentRows, list) || currentRows;
          const nextList = summarizeChatListRow(list, nextRows);
          setSelectedChatListSnapshot(nextList);
          return nextList;
        })
      );
    },
    [selectedChatListId, summarizeChatListRow]
  );

  // Patch a single list item wherever it lives across the conversation's lists.
  // Both the pending-list detail and the smart-list overlay derive from
  // chatLists, so one patch keeps them in sync automatically.
  const patchChatListItemEverywhere = useCallback(
    (itemId, patch) => {
      setChatLists((previous) =>
        (Array.isArray(previous) ? previous : []).map((list) => {
          const items = Array.isArray(list.items) ? list.items : [];
          if (!items.some((it) => String(it.id) === String(itemId))) return list;
          const nextItems = items.map((it) => (String(it.id) === String(itemId) ? { ...it, ...patch } : it));
          const nextList = summarizeChatListRow(list, nextItems);
          if (String(list.id) === String(selectedChatListId)) setSelectedChatListSnapshot(nextList);
          return nextList;
        })
      );
    },
    [selectedChatListId, summarizeChatListRow]
  );

  // Tag / re-tag a pending-work subtask (H/T/O). Stored on department.
  const setChatSubtaskCategory = useCallback(
    async (item, value) => {
      if (!item?.id) return;
      const next = String(item.department || "") === value ? null : value;
      patchChatListItemEverywhere(item.id, { department: next });
      try {
        await supabase.from("chat_list_items").update({ department: next }).eq("id", item.id);
        void refreshSelectedChatLists();
      } catch (err) {
        setError(chatErrorMessage(err));
      }
    },
    // refreshSelectedChatLists is stable enough for this handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patchChatListItemEverywhere, chatErrorMessage]
  );

  // Tag / untag a pending-work subtask as "H" (Home Depot). Unlike T (a plain
  // tag), H mirrors the item into a real Home Depot list with full HD features
  // and keeps the two in sync — handled server-side by the set_hd_tag action.
  const setChatSubtaskHomeDepot = useCallback(
    async (item, on) => {
      if (!item?.id) return;
      patchChatListItemEverywhere(item.id, { department: on ? "Home Depot" : null });
      try {
        await chatFetch("/api/chat", {
          method: "POST",
          body: JSON.stringify({ action: "set_hd_tag", company_id: companyId, item_id: item.id, on }),
        });
      } catch (err) {
        setError(chatErrorMessage(err));
      }
      void refreshSelectedChatLists();
    },
    // chatFetch/refreshSelectedChatLists are defined later — kept out of deps to
    // avoid a temporal-dead-zone crash at render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patchChatListItemEverywhere, companyId, chatErrorMessage]
  );

  // Toggle any list item done from anywhere (used by the smart-list overlay,
  // where the item may live in a different list than the selected one).
  const toggleChatListItemAnywhere = useCallback(
    async (item) => {
      if (!item?.id) return;
      const nextDone = !item.is_done;
      patchChatListItemEverywhere(item.id, {
        is_done: nextDone,
        completed_at: nextDone ? new Date().toISOString() : null,
        completed_by: nextDone ? currentUserId : null,
      });
      try {
        await chatFetch("/api/chat", {
          method: "POST",
          body: JSON.stringify({ action: "toggle_list_item", company_id: companyId, item_id: item.id, done: nextDone }),
        });
        void refreshSelectedChatLists();
      } catch (err) {
        setError(chatErrorMessage(err));
      }
    },
    // chatFetch/refreshSelectedChatLists are defined later in the component and
    // are stateless wrappers — referencing them in the body is fine, but keeping
    // them out of the dep array avoids a temporal-dead-zone crash at render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patchChatListItemEverywhere, currentUserId, companyId, chatErrorMessage]
  );

  // Live smart lists: all subtasks across this chat's pending-work lists,
  // grouped by tag. Only H and T are user-applied; anything untagged counts as
  // "Other". Same underlying rows as the lists themselves, so ticking stays in
  // sync everywhere.
  const chatSmartCategoryItems = useMemo(() => {
    const byCat = { "Home Depot": [], Tool: [], Other: [] };
    for (const list of Array.isArray(chatLists) ? chatLists : []) {
      if (String(list?.list_type || "") !== "pending_job") continue;
      for (const it of Array.isArray(list.items) ? list.items : []) {
        const isSub = Boolean(it?.parent_item_id) || Number(it?.item_level || 0) >= 1;
        if (!isSub) continue;
        const cat = String(it?.department || "");
        const bucket = cat === "Home Depot" ? "Home Depot" : cat === "Tool" ? "Tool" : "Other";
        byCat[bucket].push({ ...it, __listId: list.id, __listTitle: list.title || "List" });
      }
    }
    return byCat;
  }, [chatLists]);

  const cacheChatConversationState = useCallback(
    (payload, meta = {}) => {
      if (!chatConversationsCacheKey) return payload;
      return writeLocalFirstCache(chatConversationsCacheKey, payload, {
        ...meta,
        companyId,
        userId: currentUserId,
        scope: "chat_conversations",
      });
    },
    [chatConversationsCacheKey, companyId, currentUserId]
  );

  const cacheChatMessageState = useCallback(
    (conversationId, payload, meta = {}) => {
      if (!conversationId) return payload;
      const key =
        String(conversationId) === String(selectedConversationId) && chatMessagesCacheKey
          ? chatMessagesCacheKey
          : makeAppCacheKey("chat", companyId || "company", currentUserId || "user", "messages", conversationId);
      return writeLocalFirstCache(key, payload, {
        ...meta,
        companyId,
        conversationId,
        userId: currentUserId,
        scope: "chat_messages",
      });
    },
    [chatMessagesCacheKey, companyId, currentUserId, selectedConversationId]
  );

  const readCachedChatMessages = useCallback(
    (conversationId) => {
      if (!conversationId) return null;
      const key =
        String(conversationId) === String(selectedConversationId) && chatMessagesCacheKey
          ? chatMessagesCacheKey
          : makeAppCacheKey("chat", companyId || "company", currentUserId || "user", "messages", conversationId);
      return readLocalFirstCacheEnvelope(key, null);
    },
    [chatMessagesCacheKey, companyId, currentUserId, selectedConversationId]
  );

  const hydrateCachedChatThread = useCallback(
    (conversationId) => {
      if (!conversationId || String(conversationId).startsWith("__company_")) {
        setMessages([]);
        setChatLists([]);
        setConversationMembers([]);
        setThreadCacheHydrated(false);
        return false;
      }
      const cached = readCachedChatMessages(conversationId);
      const hasCachedThreadState = Boolean(cached?.savedAt || cached?.value);
      setThreadCacheHydrated(hasCachedThreadState);
      if (!cached?.value) {
        setMessages([]);
        setChatLists([]);
        setConversationMembers([]);
        return false;
      }
      const cachedMessages = Array.isArray(cached.value.messages) ? cached.value.messages : [];
      const cachedLists = Array.isArray(cached.value.lists) ? cached.value.lists : [];
      setMessages(mergeChatMessagesWithLocalState(cachedMessages, conversationId, []));
      setChatLists(mergeChatListsWithLocalState(cachedLists, []));
      setConversationMembers(Array.isArray(cached.value.conversation_members) ? cached.value.conversation_members : []);
      setMessagesLoading(false);
      return true;
    },
    [mergeChatListsWithLocalState, mergeChatMessagesWithLocalState, readCachedChatMessages]
  );

  const openChatConversation = useCallback(
    (conversationId) => {
      setManageOpen(false);
      setSelectedChatListId("");
      setSelectedChatListSnapshot(null);
      setEditingListItemId("");
      setEditingListItemText("");
      setListItemDraft("");
      setSelectedChatListShowCompleted(false);
      hydrateCachedChatThread(conversationId);
      setSelectedConversationId(conversationId);
      setChatPane("thread");
    },
    [hydrateCachedChatThread]
  );

  const markConversationRead = useCallback(
    async (conversationId) => {
      if (!conversationId || String(conversationId).startsWith("__company_") || selectedConversation?.pendingSetup) return;
      try {
        await chatFetch("/api/chat", {
          method: "POST",
          body: JSON.stringify({
            action: "mark_read",
            company_id: companyId,
            conversation_id: conversationId,
          }),
        });
      } catch (err) {
        console.warn("[CHAT] mark_read failed", err);
      }
    },
    [companyId, selectedConversation?.pendingSetup]
  );

  const messageStatusForRow = useCallback(
    (message) => {
      if (!message) return "sent";
      if (message.__optimistic) return String(message.__sync_state || "sending");
      if (String(message.sender_user_id) !== String(currentUserId)) return "";
      const readMembers = (conversationMembers || []).filter((member) => String(member.user_id) !== String(currentUserId));
      const hasAnyoneRead = readMembers.some((member) => {
        const readAt = String(member.last_read_at || member.lastReadAt || "").trim();
        return Boolean(readAt) && new Date(readAt).getTime() >= new Date(message.created_at || 0).getTime();
      });
      return hasAnyoneRead ? "read" : "delivered";
    },
    [conversationMembers, currentUserId]
  );

  const clearChatMessagePressTimer = useCallback(() => {
    if (chatMessagePressTimerRef.current && typeof window !== "undefined") {
      window.clearTimeout(chatMessagePressTimerRef.current);
    }
    chatMessagePressTimerRef.current = null;
    chatMessagePressTargetRef.current = null;
  }, []);

  const openChatMessageMenu = useCallback(
    (message) => {
      if (!message) return;
      clearChatMessagePressTimer();
      setChatActiveMessage(message);
    },
    [clearChatMessagePressTimer]
  );

  const beginChatMessagePress = useCallback(
    (message) => {
      if (!message) return;
      clearChatMessagePressTimer();
      chatMessagePressTargetRef.current = message;
      chatMessagePressTimerRef.current = window.setTimeout(() => {
        setChatActiveMessage(chatMessagePressTargetRef.current);
        clearChatMessagePressTimer();
      }, 450);
    },
    [clearChatMessagePressTimer]
  );

  const clearChatMessageActions = useCallback(() => {
    setChatActiveMessage(null);
  }, []);

  const renderChatMessageStatus = useCallback(
    (message) => {
      const status = messageStatusForRow(message);
      if (String(message?.sender_user_id || "") !== String(currentUserId)) return null;
      const iconClass = status === "read" ? "text-[#F2C14E]" : "text-white/55";
      if (status === "sending" || status === "queued") {
        return (
          <span className={`inline-flex items-center gap-[1px] ${iconClass}`} aria-label="Message sending">
            <svg viewBox="0 0 18 18" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 9l3 3 9-9" />
            </svg>
          </span>
        );
      }
      if (status === "delivered" || status === "read") {
        return (
          <span className={`inline-flex items-center gap-[1px] ${iconClass}`} aria-label={status === "read" ? "Read" : "Delivered"}>
            <svg viewBox="0 0 18 18" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 9.5 5.8 13 15 4" />
            </svg>
            <svg viewBox="0 0 18 18" className="h-3 w-3 -ml-[3px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9.5 9.3 13 18 4" />
            </svg>
          </span>
        );
      }
      return null;
    },
    [currentUserId, messageStatusForRow]
  );

  const getToken = useCallback(async () => {
    const { data, error: sessionError } = await safeGetSession();
    if (sessionError) throw sessionError;
    const token = data?.session?.access_token;
    if (!token) throw new Error("Sign in again to use chat.");
    return token;
  }, []);

  const chatFetch = async (path, options = {}) => {
    const token = await getToken();
    const response = await fetch(getOperaApiUrl(path), {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || "Chat request failed");
    return data;
  };

  const formatChatTime = useCallback(
    (value) => {
      if (!value) return "";
      try {
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: companyTimeZone || DEFAULT_COMPANY_TIME_ZONE,
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date(value));
      } catch {
        return "";
      }
    },
    [companyTimeZone]
  );

  const displayConversationName = useCallback(
    (conversation) => {
      if (!conversation) return "Chat";
      if (conversation.type === "company") return "All employees";
      if (conversation.type === "direct") {
        const otherUserId = (conversation.member_user_ids || []).find((userId) => String(userId) !== String(currentUserId));
        return memberById[String(otherUserId)]?.name || conversation.name || "Direct message";
      }
      return conversation.name || "Group chat";
    },
    [currentUserId, memberById]
  );
  const visibleConversationRows = useMemo(() => {
    const term = chatSearch.trim().toLowerCase();
    return conversationRows.filter((conversation) => {
      if (chatFilter === "pinned" && !conversation.pinned) return false;
      if (chatFilter === "groups" && conversation.type !== "group") return false;
      if (!term) return true;
      const name = displayConversationName(conversation).toLowerCase();
      const preview = String(conversation.last_message || "").toLowerCase();
      return name.includes(term) || preview.includes(term);
    });
  }, [chatFilter, chatSearch, conversationRows, displayConversationName]);
  const chatFilterCounts = useMemo(
    () => ({
      all: conversationRows.length,
      pinned: conversationRows.filter((conversation) => Boolean(conversation?.pinned)).length,
      groups: conversationRows.filter((conversation) => conversation?.type === "group").length,
    }),
    [conversationRows]
  );

  const safeChatFileName = useCallback((file) => {
    const raw = String(file?.name || "chat-photo.jpg").toLowerCase();
    const base = raw.replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return base || "chat-photo.jpg";
  }, []);

  const loadConversations = useCallback(
    async ({ silent = false } = {}) => {
      if (!companyId || !currentUserId) return;
      const cached = readLocalFirstCacheEnvelope(chatConversationsCacheKey, null);
      if (cached?.value) {
        const cachedConversations = Array.isArray(cached.value.conversations) ? cached.value.conversations : [];
        const cachedMembers = Array.isArray(cached.value.members) ? cached.value.members : [];
        setConversations(cachedConversations);
        setMembers(cachedMembers);
        if (cachedConversations.length) {
          setSelectedConversationId((previous) => previous || cachedConversations[0]?.id || "");
        }
      }
      if (!silent && !cached?.savedAt) setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({ action: "list", company_id: companyId });
        const data = await chatFetch(`/api/chat?${query.toString()}`);
        const nextConversations = data.conversations || [];
        setConversations(nextConversations);
        setMembers(data.members || []);
        cacheChatConversationState(
          {
            conversations: nextConversations,
            members: data.members || [],
          },
          { source: "remote" }
        );
        setSelectedConversationId((previous) => {
          if (previous && nextConversations.some((conversation) => String(conversation.id) === String(previous))) {
            return previous;
          }
          return nextConversations[0]?.id || "";
        });
      } catch (err) {
        setError(chatErrorMessage(err));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [cacheChatConversationState, chatConversationsCacheKey, chatErrorMessage, companyId, currentUserId]
  );

  const loadMessages = useCallback(
    async ({ silent = false } = {}) => {
      if (!companyId || !selectedConversationId || String(selectedConversationId).startsWith("__company_")) {
        setMessages([]);
        setChatLists([]);
        setConversationMembers([]);
        setThreadCacheHydrated(false);
        return;
      }
      const cached = readCachedChatMessages(selectedConversationId);
      const hasCachedThreadState = Boolean(cached?.savedAt || cached?.value);
      setThreadCacheHydrated(hasCachedThreadState);
      if (!cached?.value) {
        setMessages([]);
        setChatLists([]);
        setConversationMembers([]);
      }
      if (cached?.value) {
        const cachedMessages = Array.isArray(cached.value.messages) ? cached.value.messages : [];
        const cachedLists = Array.isArray(cached.value.lists) ? cached.value.lists : [];
        setMessages(mergeChatMessagesWithLocalState(cachedMessages, selectedConversationId));
        setChatLists(mergeChatListsWithLocalState(cachedLists, chatListsRef.current));
        setConversationMembers(Array.isArray(cached.value.conversation_members) ? cached.value.conversation_members : []);
        setMessagesLoading(false);
      }
      if (!silent && !hasCachedThreadState) setMessagesLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({
          action: "messages",
          company_id: companyId,
          conversation_id: selectedConversationId,
          limit: "60",
        });
        const data = await chatFetch(`/api/chat?${query.toString()}`);
        const nextMessages = mergeChatMessagesWithLocalState(
          data.messages || [],
          selectedConversationId,
          hasCachedThreadState ? messagesRef.current : []
        );
        const nextLists = mergeChatListsWithLocalState(data.lists || [], hasCachedThreadState ? chatListsRef.current : []);
        const nextConversationMembers = Array.isArray(data.conversation_members) ? data.conversation_members : [];
        setMessages(nextMessages);
        setChatLists(nextLists);
        setConversationMembers(nextConversationMembers);
        cacheChatMessageState(
          selectedConversationId,
          {
            messages: nextMessages,
            lists: nextLists,
            conversation_members: nextConversationMembers,
          },
          { source: "remote" }
        );
        void markConversationRead(selectedConversationId);
      } catch (err) {
        setError(chatErrorMessage(err));
      } finally {
        if (!silent) setMessagesLoading(false);
      }
    },
    [
      cacheChatMessageState,
      chatErrorMessage,
      companyId,
      markConversationRead,
      mergeChatListsWithLocalState,
      mergeChatMessagesWithLocalState,
      readCachedChatMessages,
      selectedConversationId,
    ]
  );

  const flushPendingChatQueue = useCallback(async () => {
    if (!companyId || !currentUserId || !selectedConversationId || selectedConversation?.pendingSetup) return;
    const queued = readLocalFirstQueue(chatPendingQueueKey, []).filter(
      (item) => String(item?.conversation_id || item?.conversationId || "") === String(selectedConversationId)
    );
    if (!queued.length) return;
    let flushed = false;
    for (const item of queued) {
      try {
        const data = await chatFetch("/api/chat", {
          method: "POST",
          body: JSON.stringify({
            action: "send",
            company_id: companyId,
            conversation_id: selectedConversationId,
            body: item.body,
            client_id: item.client_id || item.clientId,
            message_type: item.message_type || item.messageType || "text",
            attachments: item.attachments || [],
            checklist_items: item.checklist_items || item.checklistItems || [],
            metadata: item.metadata || {},
          }),
        });
        if (Array.isArray(data?.notification_ids) && data.notification_ids.length > 0) {
          void requestSendPushForNotificationIds(data.notification_ids);
        }
        removeLocalFirstQueueItem(
          chatPendingQueueKey,
          (queueItem) => String(queueItem?.client_id || queueItem?.clientId || "") === String(item.client_id || item.clientId)
        );
        flushed = true;
      } catch (err) {
        console.warn("[CHAT] queued message retry failed", err);
      }
    }
    if (flushed) {
      await loadMessages({ silent: true });
      await loadConversations({ silent: true });
    }
  }, [
    chatPendingQueueKey,
    companyId,
    currentUserId,
    loadConversations,
    loadMessages,
    selectedConversation?.pendingSetup,
    selectedConversationId,
  ]);

  useEffect(() => {
    if (!active) return;
    void loadConversations();
  }, [active, loadConversations]);

  useEffect(() => {
    if (!active || !selectedConversationId || selectedConversation?.pendingSetup) return;
    void loadMessages();
  }, [active, loadMessages, selectedConversation?.pendingSetup, selectedConversationId]);

  useEffect(() => {
    hydrateCachedChatThread(selectedConversationId);
  }, [hydrateCachedChatThread, selectedConversationId]);

  useEffect(() => {
    if (selectedChatList) {
      setSelectedChatListSnapshot(selectedChatList);
    } else if (!selectedChatListId) {
      setSelectedChatListSnapshot(null);
    }
  }, [selectedChatList, selectedChatListId]);

  useEffect(() => {
    setSelectedChatListShowCompleted(false);
    setEditingListItemId("");
    setEditingListItemText("");
    setAssigningListItemId("");
    setListItemDraft("");
  }, [selectedChatListId]);

  useEffect(() => {
    if (!active || !companyId || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search || "");
    if (params.get("tab") !== "chat") return;
    const routeConversationId = String(params.get("conversationId") || "").trim();
    if (
      routeConversationId &&
      routeConversationId !== String(selectedConversationId) &&
      conversationRows.some((conversation) => String(conversation.id) === routeConversationId)
    ) {
      openChatConversation(routeConversationId);
    }
    const notificationId = String(params.get("notificationId") || "").trim();
    if (!notificationId || !authUser?.id) return;
    const ts = new Date().toISOString();
    void supabase
      .from("notifications")
      .update({ read_at: ts, is_read: true })
      .eq("id", notificationId)
      .eq("recipient_user_id", authUser.id)
      .then(({ error }) => {
        if (error) {
          console.warn("[CHAT] mark notification read failed", error);
          return;
        }
        setInAppNotifications((prev) =>
          (Array.isArray(prev) ? prev : []).map((row) =>
            String(row?.id) === notificationId ? { ...row, read_at: ts, is_read: true } : row
          )
        );
        params.delete("notificationId");
        const nextQuery = params.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash || ""}`;
        window.history.replaceState({}, "", nextUrl);
      });
  }, [active, authUser?.id, companyId, conversationRows, selectedConversationId]);

  useEffect(() => {
    if (!selectedChatListId || chatPane !== "thread") return;
    requestAnimationFrame(() => {
      chatMessageInputRef.current?.focus?.();
    });
  }, [chatPane, selectedChatListId]);

  useEffect(() => {
    if (chatPane !== "thread") return;
    const node = chatThreadScrollRef.current;
    if (!node) return;
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distanceFromBottom > 160 && chatTimelineRows.length > 1) return;
    requestAnimationFrame(() => scrollChatThreadToBottom(chatTimelineRows.length > 1 ? "smooth" : "auto"));
  }, [chatPane, chatTimelineRows.length, scrollChatThreadToBottom]);

  // Opening a conversation must always land on the newest message. The effect
  // above skips scrolling when the thread starts scrolled up (its distance
  // guard exists so an incoming message doesn't yank a user reading history),
  // but on first open that guard wrongly left the view at the top. Force a
  // jump to the bottom whenever the selected conversation changes.
  useEffect(() => {
    if (chatPane !== "thread" || !selectedConversationId) return;
    requestAnimationFrame(() => scrollChatThreadToBottom("auto"));
    const timer = window.setTimeout(() => scrollChatThreadToBottom("auto"), 120);
    return () => window.clearTimeout(timer);
  }, [chatPane, selectedConversationId, scrollChatThreadToBottom]);

  // When the mobile keyboard opens/closes the visible viewport resizes. While
  // the user is typing (composer focused), keep the newest message pinned just
  // above the composer so it never ends up hidden behind the keyboard.
  useEffect(() => {
    if (chatPane !== "thread") return undefined;
    if (typeof window === "undefined" || !window.visualViewport) return undefined;
    const viewport = window.visualViewport;
    const handleViewportResize = () => {
      if (document.activeElement === chatMessageInputRef.current) {
        requestAnimationFrame(() => scrollChatThreadToBottom("auto"));
      }
    };
    viewport.addEventListener("resize", handleViewportResize);
    return () => viewport.removeEventListener("resize", handleViewportResize);
  }, [chatPane, scrollChatThreadToBottom]);

  useEffect(() => {
    if (!selectedChatListId || chatPane !== "list-detail") return;
    requestAnimationFrame(() => {
      chatListItemInputRef.current?.focus?.();
    });
  }, [chatPane, selectedChatListId]);


  useEffect(() => {
    if (!selectedChatListId || chatPane !== "list-detail" || chatListFocusRestoreTick <= 0 || typeof window === "undefined") {
      return;
    }
    const focusInput = () => {
      const input = chatListItemInputRef.current;
      if (!input) return;
      input.focus?.();
      const valueLength = String(input.value || "").length;
      input.setSelectionRange?.(valueLength, valueLength);
    };
    requestAnimationFrame(() => focusInput());
    const timeoutIds = [80, 220, 420].map((delay) => window.setTimeout(focusInput, delay));
    return () => timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
  }, [chatListFocusRestoreTick, chatPane, selectedChatListId, selectedChatListResolved?.items?.length]);

  useEffect(() => {
    if (!active || !selectedConversationId || selectedConversation?.pendingSetup) return;
    void flushPendingChatQueue();
    const intervalId = window.setInterval(() => {
      void flushPendingChatQueue();
    }, 12000);
    return () => window.clearInterval(intervalId);
  }, [active, flushPendingChatQueue, selectedConversation?.pendingSetup, selectedConversationId]);

  useEffect(() => {
    if (!listComposerOpen) return;
    setListTitle("");
    setListItemsText("");
    requestAnimationFrame(() => {
      chatListTitleInputRef.current?.focus?.();
      chatListTitleInputRef.current?.select?.();
    });
  }, [listComposerOpen]);

  // When the composer is open on a Home Depot list, load AI-suggested store
  // locations for the company's default city so the store field becomes a
  // pick-list (with free text still allowed).
  useEffect(() => {
    if (!listComposerOpen || listType !== "home_depot" || !companyId) return;
    if (hdStoreOptions.length || hdStoresLoading) return;
    let city = "Ottawa, Ontario";
    try {
      city = (typeof window !== "undefined" && window.localStorage?.getItem("opera.hdDefaultCity")) || city;
    } catch {
      /* ignore */
    }
    let cancelled = false;
    setHdStoresLoading(true);
    (async () => {
      try {
        const data = await chatFetch("/api/hd-intelligence", {
          method: "POST",
          body: JSON.stringify({ action: "stores", company_id: companyId, city }),
        });
        if (!cancelled && Array.isArray(data?.stores)) setHdStoreOptions(data.stores);
      } catch {
        /* ignore — free text still works */
      } finally {
        if (!cancelled) setHdStoresLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listComposerOpen, listType, companyId]);

  // Store typeahead: as the user types an area we don't already have, ask the
  // AI for Home Depot stores near it and merge them into the suggestions. The
  // default-city list already covers the common case; this covers other areas.
  useEffect(() => {
    if (!listComposerOpen || listType !== "home_depot" || !companyId) return undefined;
    const q = listStoreName.trim();
    if (q.length < 2) return undefined;
    const ql = q.toLowerCase();
    const alreadyHave = hdStoreOptions.some(
      (s) => String(s.name || "").toLowerCase().includes(ql) || String(s.address || "").toLowerCase().includes(ql)
    );
    if (alreadyHave) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setHdStoreSuggestLoading(true);
      try {
        const data = await chatFetch("/api/hd-intelligence", {
          method: "POST",
          body: JSON.stringify({ action: "stores", company_id: companyId, city: q }),
        });
        if (!cancelled && Array.isArray(data?.stores) && data.stores.length) {
          setHdStoreOptions((prev) => {
            const seen = new Set((Array.isArray(prev) ? prev : []).map((s) => String(s.name || "").toLowerCase()));
            const merged = [...(Array.isArray(prev) ? prev : [])];
            for (const s of data.stores) {
              const key = String(s?.name || "").toLowerCase();
              if (key && !seen.has(key)) {
                seen.add(key);
                merged.push(s);
              }
            }
            return merged;
          });
        }
      } catch {
        /* ignore — free text still works */
      } finally {
        if (!cancelled) setHdStoreSuggestLoading(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listStoreName, listComposerOpen, listType, companyId]);

  useEffect(() => {
    if (!editingListItemId) return;
    const selectAll = () => {
      const input = chatListEditInputRef.current;
      if (!input) return;
      input.focus?.();
      const valueLength = String(input.value || "").length;
      input.setSelectionRange?.(0, valueLength);
    };
    selectAll();
    requestAnimationFrame(() => selectAll());
    const timeoutId = window.setTimeout(() => selectAll(), 90);
    return () => window.clearTimeout(timeoutId);
  }, [editingListItemId]);

  useEffect(() => {
    if (!active) return;
    // The postgres_changes realtime subscription below already keeps the open
    // conversation's messages current instantly, so this poll only needs to
    // exist as a fallback for a dropped realtime connection and to catch
    // conversation-list changes (new conversations/unread counts) that the
    // per-conversation realtime channel doesn't cover. Lengthened from 9s to
    // reduce redundant network/render churn while chat is open.
    const timer = window.setInterval(() => {
      void loadConversations({ silent: true });
      if (selectedConversationId && !selectedConversation?.pendingSetup) void loadMessages({ silent: true });
    }, 45000);
    return () => window.clearInterval(timer);
  }, [active, loadConversations, loadMessages, selectedConversation?.pendingSetup, selectedConversationId]);

  useEffect(() => {
    if (!active || !selectedConversationId || selectedConversation?.pendingSetup) return;
    let channel = null;
    try {
      channel = supabase
        .channel(`opera-chat-live-${selectedConversationId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "chat_messages",
            filter: `conversation_id=eq.${selectedConversationId}`,
          },
          () => {
            void loadMessages({ silent: true });
          }
        )
        .subscribe();
    } catch {
      channel = null;
    }
    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [active, loadMessages, selectedConversation?.pendingSetup, selectedConversationId]);

  useEffect(() => {
    return () => clearChatMessagePressTimer();
  }, [clearChatMessagePressTimer]);

  async function sendChatMessage() {
    const body = messageDraft.trim();
    if (!body || !selectedConversationId || selectedConversation?.pendingSetup) return;
    const createdAt = new Date().toISOString();
    const clientId = `${currentUserId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const replyMetadata = chatReplyTarget
      ? {
          reply_to_message_id: chatReplyTarget.id || null,
          reply_to_body: String(chatReplyTarget.body || "").slice(0, 300),
          reply_to_sender_name: String(chatReplyTarget.sender_name || "").slice(0, 120),
          reply_to_created_at: chatReplyTarget.created_at || null,
        }
      : {};
    const optimisticMessage = {
      id: clientId,
      client_id: clientId,
      sender_user_id: currentUserId,
      sender_name: currentUserDisplayName,
      body,
      message_type: "text",
      metadata: replyMetadata,
      attachments: [],
      checklist_items: [],
      deleted: false,
      pinned: false,
      can_delete: true,
      can_pin: false,
      created_at: createdAt,
      __optimistic: true,
      __sync_state: "sending",
    };
    const optimisticMessages = [...messages, optimisticMessage];
    setMessages(optimisticMessages);
    cacheChatMessageState(
      selectedConversationId,
      {
        messages: optimisticMessages,
        lists: chatLists,
        conversation_members: conversationMembers,
      },
      { source: "optimistic_send" }
    );
    enqueueLocalFirstQueueItem(
      chatPendingQueueKey,
      {
        conversation_id: selectedConversationId,
        company_id: companyId,
        body,
        client_id: clientId,
        created_at: createdAt,
        message_type: "text",
        sender_user_id: currentUserId,
        metadata: replyMetadata,
      },
      { dedupeKey: clientId }
    );
    setMessageDraft("");
    setChatReplyTarget(null);
    setSending(true);
    setError("");
    // Always jump to the newest message after sending, even if the user had
    // scrolled up, so their just-sent message is on screen. Fire again shortly
    // after to catch the height change when the silent reload swaps the
    // optimistic row for the delivered one.
    requestAnimationFrame(() => scrollChatThreadToBottom("smooth"));
    window.setTimeout(() => scrollChatThreadToBottom("smooth"), 250);
    try {
      const data = await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          action: "send",
          company_id: companyId,
          conversation_id: selectedConversationId,
          body,
          client_id: clientId,
          metadata: replyMetadata,
        }),
      });
      if (Array.isArray(data?.notification_ids) && data.notification_ids.length > 0) {
        void requestSendPushForNotificationIds(data.notification_ids);
      }
      setMessages((current) =>
        current.map((message) =>
          String(message.client_id || message.id) === String(clientId)
            ? {
                ...message,
                id: data?.message?.id || data?.message?.created_at || message.id,
                created_at: data?.message?.created_at || message.created_at,
                __optimistic: false,
                __sync_state: "delivered",
              }
            : message
        )
      );
      removeLocalFirstQueueItem(chatPendingQueueKey, (item) => String(item?.client_id || item?.clientId || "") === String(clientId));
      void loadMessages({ silent: true }).catch(() => {});
      void loadConversations({ silent: true }).catch(() => {});
    } catch (err) {
      setMessages((current) =>
        current.map((message) =>
          String(message.client_id || message.id) === String(clientId)
            ? { ...message, __optimistic: true, __sync_state: "queued" }
            : message
        )
      );
      replaceLocalFirstQueueItem(
        chatPendingQueueKey,
        (item) => String(item?.client_id || item?.clientId || "") === String(clientId),
        {
          failed_at: new Date().toISOString(),
          error: chatErrorMessage(err),
        }
      );
      setError("Message saved locally. It will retry in the background.");
    } finally {
      setSending(false);
      requestAnimationFrame(() => chatMessageInputRef.current?.focus?.());
    }
  };

  const copyChatMessageText = useCallback(async (message) => {
    const text = String(message?.body || "").trim();
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
    } catch (err) {
      console.warn("[CHAT] copy failed", err);
    }
  }, []);

  const saveChatMessageMedia = useCallback((message) => {
    const url = message?.attachments?.[0]?.public_url;
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  const openChatImageViewer = useCallback((attachment, message) => {
    if (!attachment?.public_url) return;
    setChatImageViewer({
      attachment,
      message,
    });
  }, []);

  const startChatReply = useCallback((message) => {
    if (!message) return;
    setChatReplyTarget(message);
    setChatActiveMessage(null);
    requestAnimationFrame(() => chatMessageInputRef.current?.focus?.());
  }, []);

  const openChatForwardTarget = useCallback((message) => {
    if (!message) return;
    setChatForwardMessage(message);
    setChatActiveMessage(null);
    setChatForwardSearch("");
    requestAnimationFrame(() => {
      chatForwardSearchRef.current?.focus?.();
    });
  }, []);

  const sendForwardedChatMessage = useCallback(
    async (targetConversationId) => {
      const targetId = String(targetConversationId || "").trim();
      if (!chatForwardMessage || !targetId || targetId === String(selectedConversationId)) return;
      const body = chatForwardMessage?.body || "";
      const attachments = Array.isArray(chatForwardMessage?.attachments) ? chatForwardMessage.attachments : [];
      try {
        const data = await chatFetch("/api/chat", {
          method: "POST",
          body: JSON.stringify({
            action: "send",
            company_id: companyId,
            conversation_id: targetId,
            body: body || "Forwarded message",
            message_type: attachments.length ? "photo" : "text",
            attachments,
            metadata: {
              forwarded_from_conversation_id: selectedConversationId,
              forwarded_from_message_id: chatForwardMessage?.id || null,
              forwarded_body: body,
            },
          }),
        });
        if (Array.isArray(data?.notification_ids) && data.notification_ids.length > 0) {
          void requestSendPushForNotificationIds(data.notification_ids);
        }
        setChatForwardMessage(null);
        setChatForwardSearch("");
      } catch (err) {
        setError(chatErrorMessage(err));
      }
    },
    [chatErrorMessage, chatForwardMessage, companyId, selectedConversationId]
  );

  const createDirectChat = async (targetUserId) => {
    setError("");
    setCreatingChat(true);
    try {
      const data = await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ action: "create_direct", company_id: companyId, target_user_id: targetUserId }),
      });
      setComposerOpen(null);
      await loadConversations({ silent: true });
      setSelectedConversationId(data?.conversation?.id || "");
    } catch (err) {
      setError(chatErrorMessage(err));
    } finally {
      setCreatingChat(false);
    }
  };

  const createGroupChat = async () => {
    if (creatingChat) return;
    setError("");
    setCreatingChat(true);
    try {
      const data = await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          action: "create_group",
          company_id: companyId,
          name: groupName,
          member_user_ids: groupMemberIds,
        }),
      });
      setComposerOpen(null);
      setGroupName("");
      setGroupMemberIds([]);
      await loadConversations({ silent: true });
      setSelectedConversationId(data?.conversation?.id || "");
    } catch (err) {
      setError(chatErrorMessage(err));
    } finally {
      setCreatingChat(false);
    }
  };

  const toggleGroupMember = (userId) => {
    setGroupMemberIds((previous) =>
      previous.includes(userId) ? previous.filter((id) => id !== userId) : [...previous, userId]
    );
  };

  const deleteChatMessage = async (message) => {
    if (!message?.id || !message.can_delete) return;
    const ok = window.confirm("Delete this message?");
    if (!ok) return;
    setError("");
    try {
      await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ action: "delete_message", company_id: companyId, message_id: message.id }),
      });
      clearChatMessageActions();
      await loadMessages({ silent: true });
      await loadConversations({ silent: true });
    } catch (err) {
      setError(chatErrorMessage(err));
    }
  };

  const toggleChecklistItem = async (item) => {
    if (!item?.id) return;
    setError("");
    try {
      await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          action: "toggle_checklist_item",
          company_id: companyId,
          item_id: item.id,
          checked: !item.is_checked,
        }),
      });
      await loadMessages({ silent: true });
    } catch (err) {
      setError(chatErrorMessage(err));
    }
  };

  const toggleConversationPin = async () => {
    if (!selectedConversationId || selectedConversation?.pendingSetup) return;
    setError("");
    try {
      await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ action: "toggle_pin", company_id: companyId, conversation_id: selectedConversationId }),
      });
      await loadConversations({ silent: true });
    } catch (err) {
      setError(chatErrorMessage(err));
    }
  };

  const toggleMessagePin = async (message) => {
    if (!message?.id || !selectedConversationId) return;
    setError("");
    try {
      await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          action: "toggle_pin",
          company_id: companyId,
          conversation_id: selectedConversationId,
          message_id: message.id,
        }),
      });
      clearChatMessageActions();
      await loadMessages({ silent: true });
    } catch (err) {
      setError(chatErrorMessage(err));
    }
  }

  const leaveSelectedConversation = async () => {
    if (!selectedCanLeave || !selectedConversationId) return;
    const ok = window.confirm("Leave this group chat?");
    if (!ok) return;
    setError("");
    try {
      await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ action: "leave_conversation", company_id: companyId, conversation_id: selectedConversationId }),
      });
      setSelectedConversationId("");
      setMessages([]);
      await loadConversations({ silent: true });
    } catch (err) {
      setError(chatErrorMessage(err));
    }
  };

  const archiveSelectedConversation = async () => {
    if (!selectedCanArchive || !selectedConversationId) return;
    const ok = window.confirm("Archive this chat for everyone?");
    if (!ok) return;
    setError("");
    try {
      await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ action: "archive_conversation", company_id: companyId, conversation_id: selectedConversationId }),
      });
      setSelectedConversationId("");
      setMessages([]);
      await loadConversations({ silent: true });
    } catch (err) {
      setError(chatErrorMessage(err));
    }
  };

  const addChatMembers = async () => {
    if (!selectedConversationId || groupAddIds.length === 0 || creatingChat) return;
    setError("");
    setCreatingChat(true);
    try {
      await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          action: "add_member",
          company_id: companyId,
          conversation_id: selectedConversationId,
          member_user_ids: groupAddIds,
        }),
      });
      setGroupAddOpen(false);
      setGroupAddIds([]);
      await loadConversations({ silent: true });
    } catch (err) {
      setError(chatErrorMessage(err));
    } finally {
      setCreatingChat(false);
    }
  };

  const removeChatMember = async (member) => {
    if (!selectedCanManage || !selectedConversationId || !member?.user_id) return;
    const ok = window.confirm(`Remove ${member.name || "this member"} from this group?`);
    if (!ok) return;
    setError("");
    try {
      await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          action: "remove_member",
          company_id: companyId,
          conversation_id: selectedConversationId,
          target_user_id: member.user_id,
        }),
      });
      await loadConversations({ silent: true });
    } catch (err) {
      setError(chatErrorMessage(err));
    }
  };

  const handleChatImagePick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !selectedConversationId || selectedConversation?.pendingSetup || chatUploading) return;
    if (!String(file.type || "").startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Choose a photo under 8 MB.");
      return;
    }
    setChatUploading(true);
    setError("");
    try {
      const fileName = safeChatFileName(file);
      const filePath = `chat/${companyId}/${selectedConversationId}/${currentUserId}/${Date.now()}-${fileName}`;
      const upload = await supabase.storage.from("project-photos").upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || "image/jpeg",
      });
      if (upload.error) throw upload.error;
      const { data } = supabase.storage.from("project-photos").getPublicUrl(filePath);
      const chatData = await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          action: "send",
          company_id: companyId,
          conversation_id: selectedConversationId,
          message_type: "photo",
          body: messageDraft.trim() || file.name || "Photo",
          client_id: `${currentUserId}-photo-${Date.now()}`,
          attachments: [
            {
              storage_bucket: "project-photos",
              storage_path: filePath,
              public_url: data?.publicUrl || "",
              mime_type: file.type || "image/jpeg",
              file_name: file.name || fileName,
              file_size: file.size,
            },
          ],
        }),
      });
      if (Array.isArray(chatData?.notification_ids) && chatData.notification_ids.length > 0) {
        void requestSendPushForNotificationIds(chatData.notification_ids);
      }
      setMessageDraft("");
      await loadMessages({ silent: true });
      await loadConversations({ silent: true });
    } catch (err) {
      setError(chatErrorMessage(err));
    } finally {
      setChatUploading(false);
    }
  };

  const createChatList = async () => {
    const items = parseChatListComposerItems(listItemsText);
    let title = listTitle.trim();
    // Home Depot lists don't need a name — auto-number them "Home Depot 1/2/…".
    if (!title && listType === "home_depot") {
      const hdCount = (Array.isArray(chatLists) ? chatLists : []).filter(
        (l) => String(l?.list_type || "") === "home_depot"
      ).length;
      title = `Home Depot ${hdCount + 1}`;
    }
    if (!selectedConversationId || selectedConversation?.pendingSetup || listBusy || !title) return;
    setListBusy(true);
    setError("");
    try {
      const data = await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          action: "create_list",
          company_id: companyId,
          conversation_id: selectedConversationId,
          title,
          items,
          list_type: listType,
          store_name: listType === "home_depot" ? listStoreName.trim() : "",
        }),
      });
      setListTitle("");
      setListItemsText("");
      setListType("other");
      setListStoreName("");
      setListComposerOpen(false);
      setSelectedChatListId(data?.list?.id || "");
      setChatPane("thread");
      setSelectedChatListShowCompleted(false);
      void loadMessages({ silent: true }).catch(() => {});
      void loadConversations({ silent: true }).catch(() => {});
    } catch (err) {
      setError(chatErrorMessage(err));
    } finally {
      setListBusy(false);
    }
  };

  const refreshSelectedChatLists = async () => {
    await loadMessages({ silent: true });
    await loadConversations({ silent: true });
  };

  // Canonical key for a store so the per-location aisle map doesn't fragment on
  // trivial spelling differences ("Barrhaven" vs "Barrhaven " vs "barrhaven,").
  // Different physical stores still stay distinct — this only collapses
  // whitespace/case/trailing punctuation, it does not merge different names.
  const hdStoreKey = (name) =>
    String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[.,;]+$/g, "")
      .trim();

  const loadHdAisleMap = useCallback(async (storeName) => {
    const store = hdStoreKey(storeName);
    if (!store || !companyId) {
      setHdAisleByDept({});
      return;
    }
    try {
      const { data } = await supabase
        .from("hd_aisle_map")
        .select("department, aisle_no")
        .eq("company_id", companyId)
        .eq("normalized_store", store);
      const map = {};
      for (const row of data || []) map[row.department] = row.aisle_no;
      setHdAisleByDept(map);
    } catch {
      setHdAisleByDept({});
    }
  }, [companyId]);

  // Classify a Home Depot list's un-classified items into departments and
  // persist them, so items group by department.
  const classifyHdList = useCallback(async (list) => {
    if (!list?.id || list.list_type !== "home_depot" || !companyId) return;
    const pending = (list.items || []).filter((item) => item?.text && !item.department && !item.is_done);
    if (!pending.length) return;
    const guardKey = `${list.id}:${pending.map((i) => i.id).join(",")}`;
    if (hdClassifyGuardRef.current === guardKey) return;
    hdClassifyGuardRef.current = guardKey;
    setHdClassifying(true);
    try {
      const data = await chatFetch("/api/hd-intelligence", {
        method: "POST",
        body: JSON.stringify({ action: "classify", company_id: companyId, items: pending.map((i) => i.text) }),
      });
      if (!data?.ok) {
        // AI unavailable (e.g. OpenAI quota) — don't persist an "Other" guess;
        // leave items unclassified so they get sorted for real once it's back.
        if (data?.message) setError(`Auto-sort unavailable: ${data.message}`);
        hdClassifyGuardRef.current = "";
        return;
      }
      const byText = new Map((data?.classifications || []).map((c) => [String(c.text).toLowerCase(), c.department]));
      let persisted = 0;
      for (const item of pending) {
        const dept = byText.get(String(item.text).toLowerCase());
        if (!dept) continue;
        const { error } = await supabase.from("chat_list_items").update({ department: dept }).eq("id", item.id);
        if (!error) persisted += 1;
      }
      if (persisted > 0) await refreshSelectedChatLists();
    } catch (err) {
      console.warn("[HD] classify failed", err);
    } finally {
      setHdClassifying(false);
    }
  }, [chatFetch, companyId, refreshSelectedChatLists]);

  const confirmHdAisle = useCallback(async (department) => {
    const list = selectedChatListResolved;
    const aisle = String(hdAisleDraft || "").trim();
    if (!list?.store_name || !department || !aisle || !companyId || !authUser?.id) return;
    const store = list.store_name.trim();
    try {
      await supabase.from("hd_aisle_map").upsert(
        {
          company_id: companyId,
          store_name: store,
          normalized_store: hdStoreKey(store),
          department,
          aisle_no: aisle,
          source: "manual",
          confirmed_by: authUser.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,normalized_store,department" }
      );
      setHdAisleByDept((prev) => ({ ...prev, [department]: aisle }));
      setHdAisleEditDept(null);
      setHdAisleDraft("");
    } catch (err) {
      setError(chatErrorMessage(err));
    }
  }, [authUser?.id, chatErrorMessage, companyId, hdAisleDraft, selectedChatListResolved]);

  // "Learning picture": photograph an aisle in-store; ChatGPT reads the aisle
  // number + departments and saves them to the shared aisle map.
  const handleHdAisleScan = useCallback(async (file) => {
    const list = selectedChatListResolved;
    if (!file || !list?.store_name || !companyId || !authUser?.id || hdLearnBusy) return;
    setHdLearnBusy(true);
    setError("");
    try {
      const path = `hd-aisle/${companyId}/${authUser.id}-${Date.now()}.jpg`;
      const up = await supabase.storage.from("project-photos").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
      if (up.error) throw up.error;
      const publicUrl = supabase.storage.from("project-photos").getPublicUrl(path)?.data?.publicUrl || "";
      const data = await chatFetch("/api/hd-intelligence", {
        method: "POST",
        body: JSON.stringify({ action: "read_aisle_scan", company_id: companyId, photo_url: publicUrl }),
      });
      const store = list.store_name.trim();
      const aisle = String(data?.aisle_no || "").trim();
      const departments = Array.isArray(data?.departments) ? data.departments : [];
      await supabase.from("hd_item_photos").insert([{
        company_id: companyId, kind: "aisle_scan", store_name: store, department: departments[0] || null,
        aisle_no: aisle || null, photo_url: publicUrl, storage_path: path, captured_by: authUser.id,
      }]);
      if (aisle && departments.length) {
        for (const dept of departments) {
          await supabase.from("hd_aisle_map").upsert(
            { company_id: companyId, store_name: store, normalized_store: hdStoreKey(store), department: dept, aisle_no: aisle, source: "aisle_scan", confirmed_by: authUser.id, updated_at: new Date().toISOString() },
            { onConflict: "company_id,normalized_store,department" }
          );
        }
        await loadHdAisleMap(store);
        setError(`Saved: aisle ${aisle} — ${departments.join(", ")}.`);
      } else {
        setError(aisle ? `Read aisle ${aisle} but no department; try again closer to the sign.` : "Couldn't read the aisle number. Get the overhead aisle sign in frame.");
      }
    } catch (err) {
      setError(chatErrorMessage(err));
    } finally {
      setHdLearnBusy(false);
    }
  }, [authUser?.id, chatErrorMessage, chatFetch, companyId, hdLearnBusy, loadHdAisleMap, selectedChatListResolved]);

  // Load the shared learned-product catalog for autocomplete + gallery picker.
  const loadHdCatalog = useCallback(async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from("hd_item_catalog")
        .select("id, typed_name, normalized_typed, exact_name, department, last_price, photo_url, times_used")
        .eq("company_id", companyId)
        .order("times_used", { ascending: false })
        .limit(500);
      if (!error) setHdCatalog(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn("[HD] catalog load failed", err);
    }
  }, [companyId]);

  // Tick-to-capture: photograph the actual product a crew member picked. ChatGPT
  // reads the exact name + price (+ aisle if the shelf sign is legible); we learn
  // it into the shared catalog and stamp the list item.
  const captureHdItemPhoto = useCallback(async (item, file) => {
    const list = selectedChatListResolved;
    if (!item?.id || !file || !companyId || !authUser?.id || hdCaptureBusy) return;
    setHdCaptureBusy(String(item.id));
    setError("");
    try {
      const path = `hd-item/${companyId}/${authUser.id}-${Date.now()}.jpg`;
      const up = await supabase.storage.from("project-photos").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
      if (up.error) throw up.error;
      const publicUrl = supabase.storage.from("project-photos").getPublicUrl(path)?.data?.publicUrl || "";
      // Always keep the photo on the item, even if AI is unavailable.
      const itemUpdate = { photo_url: publicUrl, photo_storage_path: path };
      const data = await chatFetch("/api/hd-intelligence", {
        method: "POST",
        body: JSON.stringify({ action: "read_item_photo", company_id: companyId, photo_url: publicUrl, hint: item.text }),
      });
      const exactName = String(data?.exact_name || "").trim();
      const dept = data?.department || item.department || null;
      const price = data?.price == null ? null : Number(data.price);
      const aisle = String(data?.aisle_no || "").trim();
      if (exactName) itemUpdate.hd_exact_name = exactName;
      if (price != null && Number.isFinite(price)) itemUpdate.hd_price = price;
      if (dept && !item.department) itemUpdate.department = dept;
      await supabase.from("chat_list_items").update(itemUpdate).eq("id", item.id);
      // Learn into the shared catalog (keyed by what the crew typed).
      const typed = String(item.text || "").trim();
      if (typed) {
        await supabase.from("hd_item_catalog").upsert(
          {
            company_id: companyId,
            typed_name: typed,
            normalized_typed: typed.toLowerCase(),
            exact_name: exactName || null,
            department: dept || null,
            last_price: price != null && Number.isFinite(price) ? price : null,
            photo_url: publicUrl,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id,normalized_typed" }
        );
      }
      // Archive the photo + reading for price history / audit.
      await supabase.from("hd_item_photos").insert([{
        company_id: companyId, kind: "item", store_name: list?.store_name?.trim() || null,
        department: dept || null, exact_name: exactName || null,
        aisle_no: aisle || null, price: price != null && Number.isFinite(price) ? price : null,
        photo_url: publicUrl, storage_path: path, captured_by: authUser.id,
      }]);
      // Bonus aisle intelligence: if the shelf sign gave a legible aisle, save it.
      if (aisle && dept && list?.store_name?.trim()) {
        const store = list.store_name.trim();
        await supabase.from("hd_aisle_map").upsert(
          { company_id: companyId, store_name: store, normalized_store: hdStoreKey(store), department: dept, aisle_no: aisle, source: "item_photo", confirmed_by: authUser.id, updated_at: new Date().toISOString() },
          { onConflict: "company_id,normalized_store,department" }
        );
        setHdAisleByDept((prev) => ({ ...prev, [dept]: aisle }));
      }
      await refreshSelectedChatLists();
      void loadHdCatalog();
      if (!data?.ok && data?.message) setError(`Photo saved. AI read unavailable: ${data.message}`);
      else if (exactName || price != null) setError(`Learned: ${exactName || item.text}${price != null ? ` — $${price}` : ""}.`);
    } catch (err) {
      setError(chatErrorMessage(err));
    } finally {
      setHdCaptureBusy("");
    }
  }, [authUser?.id, chatErrorMessage, chatFetch, companyId, hdCaptureBusy, loadHdCatalog, refreshSelectedChatLists, selectedChatListResolved]);

  // Add a learned catalog product straight onto the current list (gallery picker).
  const addCatalogItemToList = useCallback(async (product) => {
    const list = selectedChatListResolved;
    if (!product || !list?.id || hdPickerBusy) return;
    setHdPickerBusy(true);
    setError("");
    const text = String(product.exact_name || product.typed_name || "").trim();
    if (!text) { setHdPickerBusy(false); return; }
    try {
      const data = await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ action: "add_list_item", company_id: companyId, list_id: list.id, text }),
      });
      const newId = data?.item?.id;
      if (newId) {
        const patch = {};
        if (product.department) patch.department = product.department;
        if (product.exact_name) patch.hd_exact_name = product.exact_name;
        if (product.last_price != null) patch.hd_price = Number(product.last_price);
        if (product.photo_url) patch.photo_url = product.photo_url;
        if (Object.keys(patch).length) await supabase.from("chat_list_items").update(patch).eq("id", newId);
      }
      await refreshSelectedChatLists();
    } catch (err) {
      setError(chatErrorMessage(err));
    } finally {
      setHdPickerBusy(false);
    }
  }, [chatErrorMessage, chatFetch, companyId, hdPickerBusy, refreshSelectedChatLists, selectedChatListResolved]);

  // Open a Home Depot list → load its store's confirmed aisles, learned catalog,
  // and classify any un-classified items into departments. (Placed after the HD
  // callbacks above so their const bindings are initialized before this effect's deps.)
  useEffect(() => {
    const list = selectedChatListResolved;
    if (!list || list.list_type !== "home_depot" || chatPane !== "list-detail") return;
    void loadHdAisleMap(list.store_name);
    void loadHdCatalog();
    void classifyHdList(list);
  }, [selectedChatListResolved, chatPane, loadHdAisleMap, loadHdCatalog, classifyHdList]);

  // Autocomplete suggestions from the shared catalog as the crew types an item.
  const hdSuggestions = useMemo(() => {
    const q = String(listItemDraft || "").trim().toLowerCase();
    if (!hdSuggestOpen || q.length < 2 || !hdCatalog.length) return [];
    const seen = new Set();
    const out = [];
    for (const row of hdCatalog) {
      const label = String(row.exact_name || row.typed_name || "").trim();
      if (!label) continue;
      const hay = `${row.typed_name || ""} ${row.exact_name || ""}`.toLowerCase();
      if (!hay.includes(q)) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
      if (out.length >= 6) break;
    }
    return out;
  }, [hdCatalog, hdSuggestOpen, listItemDraft]);

  // Open Home Depot's site with the item pre-searched. The store the browser
  // last set as "My Store" on homedepot.ca drives the in-store aisle/bay shown.
  const openHomeDepotSearch = (itemText) => {
    const query = encodeURIComponent(String(itemText || "").trim());
    if (!query || typeof window === "undefined") return;
    window.open(`https://www.homedepot.ca/search?q=${query}`, "_blank", "noopener,noreferrer");
  };

  const saveListStoreName = async (list) => {
    if (!list?.id || storeNameSaving) return;
    setStoreNameSaving(true);
    setError("");
    try {
      await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          action: "set_list_store",
          company_id: companyId,
          list_id: list.id,
          store_name: String(storeNameDraft ?? "").trim(),
        }),
      });
      setStoreNameDraft(null);
      await refreshSelectedChatLists();
    } catch (err) {
      setError(chatErrorMessage(err));
    } finally {
      setStoreNameSaving(false);
    }
  };

  const saveListTitle = async (list) => {
    if (!list?.id || listTitleSaving) return;
    const nextTitle = String(listTitleDraft ?? "").trim();
    const nextType = listTypeDraft || "other";
    const titleUnchanged = !nextTitle || nextTitle === String(list.title || "").trim();
    const typeUnchanged = nextType === String(list.list_type || "other");
    if (!nextTitle || (titleUnchanged && typeUnchanged)) {
      setListTitleDraft(null);
      return;
    }
    setListTitleSaving(true);
    setError("");
    try {
      await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          action: "set_list_title",
          company_id: companyId,
          list_id: list.id,
          title: nextTitle,
          list_type: nextType,
        }),
      });
      setListTitleDraft(null);
      await refreshSelectedChatLists();
    } catch (err) {
      setError(chatErrorMessage(err));
    } finally {
      setListTitleSaving(false);
    }
  };

  // ---- Press-and-hold drag to reorder top-level list items ----
  const topLevelOrderIds = () =>
    (Array.isArray(selectedChatListHierarchy) ? selectedChatListHierarchy : []).map((i) => String(i.id));

  const beginListItemPress = (item, event) => {
    // Reorder is only for plain lists (HD is aisle-sorted) and top-level items.
    // Triggered from the grip handle, so start dragging immediately and capture
    // the pointer so moves/release keep firing on the handle as the finger
    // travels over other rows.
    if (selectedChatListResolved?.list_type === "home_depot") return;
    if (Number(item?.item_level || 0) !== 0) return;
    event?.stopPropagation?.();
    try { event?.currentTarget?.setPointerCapture?.(event.pointerId); } catch { /* unsupported */ }
    const d = dragReorderRef.current;
    d.id = String(item.id);
    d.order = topLevelOrderIds();
    d.pointerId = event?.pointerId;
    setDragItemId(String(item.id));
    setDragOrder(d.order.slice());
    try { navigator.vibrate?.(15); } catch { /* no haptics */ }
  };

  const moveListItemPress = (event) => {
    const d = dragReorderRef.current;
    if (!d.id) return;
    event?.preventDefault?.();
    const y = event?.clientY ?? 0;
    let targetId = null;
    let after = false;
    for (const id of d.order) {
      const el = chatRowElsRef.current[id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) {
        targetId = id;
        after = y > r.top + r.height / 2;
        break;
      }
    }
    if (targetId && targetId !== d.id) {
      const order = d.order.filter((x) => x !== d.id);
      const idx = order.indexOf(targetId);
      order.splice(after ? idx + 1 : idx, 0, d.id);
      d.order = order;
      setDragOrder(order.slice());
    }
  };

  const endListItemPress = async () => {
    const d = dragReorderRef.current;
    if (d.timer) { clearTimeout(d.timer); d.timer = null; }
    const wasDragging = Boolean(d.id);
    const order = d.order.slice();
    d.id = null;
    d.order = [];
    setDragItemId(null);
    setDragOrder(null);
    if (!wasDragging || order.length === 0) return;
    try {
      await Promise.all(
        order.map((id, i) =>
          supabase
            .from("chat_list_items")
            .update({ sort_order: i + 1, updated_at: new Date().toISOString() })
            .eq("id", id)
        )
      );
      await refreshSelectedChatLists();
    } catch (err) {
      setError(chatErrorMessage(err));
    }
  };

  const addChatListItem = async (parentItem = null) => {
    const parentId = String(parentItem?.id || addingSubItemParentId || "");
    const usingSubItemDraft = Boolean(parentId);
    const sourceDraft = usingSubItemDraft ? subItemDraft : listItemDraft;
    const text = normalizeChatListItemDraftText(sourceDraft);
    if (!selectedChatListResolved?.id || !text || listBusy) return;
    setListBusy(true);
    setError("");
    const listId = String(selectedChatListResolved.id);
    const now = new Date().toISOString();
    const rows = summarizeChatListItems(selectedChatListResolved.items || []);
    const nextNumber = rows.reduce((max, item) => Math.max(max, Number(item.item_number || 0)), 0) + 1;
    const siblingChildren = parentId
      ? rows.filter((row) => String(row?.parent_item_id || "") === parentId && Number(row?.item_level || 0) === 1)
      : [];
    const nextChildOrder = siblingChildren.reduce((max, item) => Math.max(max, Number(item?.child_order || 0)), 0) + 1;
    const parentBranchMaxSort = parentId
      ? rows
          .filter((row) => String(row?.id || "") === parentId || String(row?.parent_item_id || "") === parentId)
          .reduce((max, row) => Math.max(max, Number(row?.sort_order || 0)), Number(parentItem?.sort_order || 0))
      : rows.reduce((max, row) => Math.max(max, Number(row?.sort_order || 0)), 0);
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticItem = {
      id: tempId,
      item_number: parentId ? Number(parentItem?.item_number || 0) : nextNumber,
      text,
      parent_item_id: parentId || null,
      item_level: parentId ? 1 : 0,
      child_order: parentId ? nextChildOrder : 0,
      sort_order: parentId ? parentBranchMaxSort + 1 : rows.length + 1,
      is_done: false,
      completed_at: null,
      completed_by: null,
      assigned_user_id: null,
      created_by: currentUserId,
      created_at: now,
      updated_at: now,
      __optimistic: true,
    };
    updateSelectedChatListRows((currentRows) => {
      if (!parentId) return [...currentRows, optimisticItem];
      return [...currentRows]
        .map((row) =>
          Number(row?.sort_order || 0) >= optimisticItem.sort_order ? { ...row, sort_order: Number(row.sort_order || 0) + 1 } : row
        )
        .concat(optimisticItem);
    });
    if (usingSubItemDraft) {
      setSubItemDraft("");
      restoreChatSubItemInputFocus();
    } else {
      setListItemDraft("");
      restoreChatListInputFocus();
    }
    try {
      await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          action: "add_list_item",
          company_id: companyId,
          list_id: listId,
          text,
          parent_item_id: parentId || null,
        }),
      });
      void refreshSelectedChatLists();
      if (!usingSubItemDraft) restoreChatListInputFocus();
    } catch (err) {
      setChatLists((previous) =>
        previous.map((list) => {
          if (String(list.id) !== listId) return list;
          const nextItems = (Array.isArray(list.items) ? list.items : []).filter((item) => String(item.id) !== tempId);
          return summarizeChatListRow(list, nextItems);
        })
      );
      setError(chatErrorMessage(err));
      if (usingSubItemDraft) restoreChatSubItemInputFocus();
      if (!usingSubItemDraft) restoreChatListInputFocus();
    } finally {
      setListBusy(false);
    }
  };

  // Photos on list items (all list types): capture with the camera or pick from
  // the gallery, attached to an item.
  const uploadListItemPhoto = async (file) => {
    const path = `list-item/${companyId}/${authUser?.id || "user"}-${Date.now()}.jpg`;
    const up = await supabase.storage.from("project-photos").upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
    if (up.error) throw up.error;
    const publicUrl = supabase.storage.from("project-photos").getPublicUrl(path)?.data?.publicUrl || "";
    return { publicUrl, path };
  };

  const attachPhotoToListItem = async (item, file) => {
    if (!item?.id || !file || listPhotoBusy) return;
    setListPhotoBusy(String(item.id));
    setError("");
    try {
      const { publicUrl, path } = await uploadListItemPhoto(file);
      await supabase.from("chat_list_items").update({ photo_url: publicUrl, photo_storage_path: path }).eq("id", item.id);
      await refreshSelectedChatLists();
    } catch (err) {
      setError(chatErrorMessage(err));
    } finally {
      setListPhotoBusy("");
    }
  };

  const addPhotoListItem = async (file) => {
    if (!file || !selectedChatListResolved?.id || listPhotoBusy) return;
    setListPhotoBusy("new");
    setError("");
    try {
      const { publicUrl, path } = await uploadListItemPhoto(file);
      const text = normalizeChatListItemDraftText(listItemDraft) || "Photo";
      const data = await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ action: "add_list_item", company_id: companyId, list_id: selectedChatListResolved.id, text }),
      });
      const newId = data?.item?.id;
      if (newId) {
        await supabase.from("chat_list_items").update({ photo_url: publicUrl, photo_storage_path: path }).eq("id", newId);
      }
      setListItemDraft("");
      await refreshSelectedChatLists();
    } catch (err) {
      setError(chatErrorMessage(err));
    } finally {
      setListPhotoBusy("");
    }
  };

  const toggleChatListItem = async (item) => {
    if (!item?.id) return;
    setError("");
    const listId = String(selectedChatListResolved?.id || "");
    const itemId = String(item.id);
    const previousRows = summarizeChatListItems(selectedChatListResolved?.items || []);
    updateSelectedChatListRows((currentRows) =>
      currentRows.map((row) => {
        const shouldToggle =
          String(row.id) === itemId || (!item.is_done && String(row.parent_item_id || "") === itemId);
        if (!shouldToggle) return row;
        return {
          ...row,
          is_done: !item.is_done,
          completed_at: !item.is_done ? new Date().toISOString() : null,
          completed_by: !item.is_done ? currentUserId : null,
        };
      })
    );
    try {
      await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          action: "toggle_list_item",
          company_id: companyId,
          item_id: item.id,
          done: !item.is_done,
        }),
      });
      void refreshSelectedChatLists();
    } catch (err) {
      setChatLists((previous) =>
        previous.map((list) => {
          if (String(list.id) !== listId) return list;
          return summarizeChatListRow(list, previousRows);
        })
      );
      setError(chatErrorMessage(err));
    }
  };

  const saveChatListItemEdit = async (item) => {
    const liveInputValue = chatListEditInputRef.current?.value;
    const text = normalizeChatListItemDraftText(
      typeof liveInputValue === "string" && liveInputValue.length ? liveInputValue : editingListItemText
    );
    if (!item?.id || !text) return;
    const originalText = normalizeChatListItemDraftText(item?.text || "");
    if (text === originalText) {
      setEditingListItemId("");
      setEditingListItemText("");
      return;
    }
    setError("");
    const listId = String(selectedChatListResolved?.id || "");
    const itemId = String(item.id);
    const previousItem = { ...item };
    updateSelectedChatListRows((currentRows) =>
      currentRows.map((row) => (String(row.id) === itemId ? { ...row, text } : row))
    );
    try {
      await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          action: "update_list_item",
          company_id: companyId,
          item_id: item.id,
          text,
        }),
      });
      setEditingListItemId("");
      setEditingListItemText("");
      void refreshSelectedChatLists();
    } catch (err) {
      setChatLists((previous) =>
        previous.map((list) => {
          if (String(list.id) !== listId) return list;
          const nextItems = (Array.isArray(list.items) ? list.items : []).map((row) =>
            String(row.id) === itemId ? previousItem : row
          );
          return summarizeChatListRow(list, nextItems);
        })
      );
      setError(chatErrorMessage(err));
    }
  };

  const deleteChatListItem = async (item) => {
    if (!item?.id) return;
    const ok = window.confirm("Delete this list item?");
    if (!ok) return;
    setError("");
    const listId = String(selectedChatListResolved?.id || "");
    const itemId = String(item.id);
    const previousRows = summarizeChatListItems(selectedChatListResolved?.items || []);
    updateSelectedChatListRows((currentRows) =>
      currentRows.filter(
        (row) => String(row.id) !== itemId && String(row.parent_item_id || "") !== itemId
      )
    );
    if (String(editingListItemId) === itemId) {
      setEditingListItemId("");
      setEditingListItemText("");
    }
    try {
      await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ action: "delete_list_item", company_id: companyId, item_id: item.id }),
      });
      await refreshSelectedChatLists();
    } catch (err) {
      setChatLists((previous) =>
        previous.map((list) => {
          if (String(list.id) !== listId) return list;
          return summarizeChatListRow(list, previousRows);
        })
      );
      setError(chatErrorMessage(err));
    }
  };

  const reparentChatListItemAction = async (item, parentItemId) => {
    if (!item?.id) return;
    setError("");
    const listId = String(selectedChatListResolved?.id || "");
    const itemId = String(item.id);
    const previousRows = summarizeChatListItems(selectedChatListResolved?.items || []);
    updateSelectedChatListRows((currentRows) =>
      currentRows.map((row) => {
        if (String(row.id) !== itemId) return row;
        return {
          ...row,
          parent_item_id: parentItemId || null,
          item_level: parentItemId ? 1 : 0,
        };
      })
    );
    try {
      await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          action: "reparent_list_item",
          company_id: companyId,
          item_id: item.id,
          parent_item_id: parentItemId || null,
        }),
      });
      void refreshSelectedChatLists();
    } catch (err) {
      setChatLists((previous) =>
        previous.map((list) => {
          if (String(list.id) !== listId) return list;
          return summarizeChatListRow(list, previousRows);
        })
      );
      setError(chatErrorMessage(err));
    }
  };

  const assignChatListItem = async (item, assignedUserId) => {
    if (!item?.id) return;
    const nextAssignedUserId = String(assignedUserId || "").trim();
    const listId = String(selectedChatListResolved?.id || "");
    const itemId = String(item.id);
    const previousRows = summarizeChatListItems(selectedChatListResolved?.items || []);
    setError("");
    updateSelectedChatListRows((currentRows) =>
      currentRows.map((row) => (String(row.id) === itemId ? { ...row, assigned_user_id: nextAssignedUserId || null } : row))
    );
    try {
      await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          action: "assign_list_item",
          company_id: companyId,
          item_id: item.id,
          assigned_user_id: nextAssignedUserId || null,
        }),
      });
      setAssigningListItemId("");
      void refreshSelectedChatLists();
    } catch (err) {
      setChatLists((previous) =>
        previous.map((list) => {
          if (String(list.id) !== listId) return list;
          return summarizeChatListRow(list, previousRows);
        })
      );
      setError(chatErrorMessage(err));
    }
  };

  const indentChatListItem = useCallback(
    (item) => {
      if (!item || Number(item?.item_level || 0) !== 0) return;
      const currentIndex = selectedChatListHierarchy.findIndex((candidate) => String(candidate.id) === String(item.id));
      if (currentIndex <= 0) return;
      if (Array.isArray(item.children) && item.children.length) {
        setError("Move or complete sub-items before indenting this main item.");
        return;
      }
      const previousMain = [...selectedChatListHierarchy.slice(0, currentIndex)].reverse().find((candidate) => Number(candidate?.item_level || 0) === 0);
      if (!previousMain?.id) return;
      void reparentChatListItemAction(item, previousMain.id);
    },
    [reparentChatListItemAction, selectedChatListHierarchy]
  );

  const outdentChatListItem = useCallback(
    (item) => {
      if (!item || Number(item?.item_level || 0) !== 1) return;
      void reparentChatListItemAction(item, "");
    },
    [reparentChatListItemAction]
  );

  const beginChatListSwipe = useCallback((itemId, x, y) => {
    chatListSwipeStateRef.current[String(itemId)] = { startX: Number(x || 0), startY: Number(y || 0) };
  }, []);

  const endChatListSwipe = useCallback(
    (item, x, y) => {
      const key = String(item?.id || "");
      const swipeState = chatListSwipeStateRef.current[key];
      delete chatListSwipeStateRef.current[key];
      if (!swipeState || !item?.id) return;
      const deltaX = Number(x || 0) - Number(swipeState.startX || 0);
      const deltaY = Math.abs(Number(y || 0) - Number(swipeState.startY || 0));
      if (deltaY > 36 || Math.abs(deltaX) < 56) return;
      if (deltaX > 0 && Number(item?.item_level || 0) === 0) {
        indentChatListItem(item);
      } else if (deltaX < 0 && Number(item?.item_level || 0) === 1) {
        outdentChatListItem(item);
      }
    },
    [indentChatListItem, outdentChatListItem]
  );

  const archiveChatList = async () => {
    if (!selectedChatListResolved?.id || !selectedChatListResolved.can_archive) return;
    const ok = window.confirm("Archive this list?");
    if (!ok) return;
    const archivedId = String(selectedChatListResolved.id);
    setError("");
    try {
      await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ action: "archive_list", company_id: companyId, list_id: archivedId }),
      });
      setSelectedChatListId("");
      setSelectedChatListSnapshot(null);
      // Drop it from local state now so the merge with cached/remote lists can't
      // re-add it (the archived list is filtered out of the server response).
      setChatLists((prev) => (Array.isArray(prev) ? prev : []).filter((l) => String(l?.id) !== archivedId));
      await refreshSelectedChatLists();
    } catch (err) {
      setError(chatErrorMessage(err));
    }
  };

  const loadArchivedLists = async () => {
    if (!companyId || !selectedConversationId) {
      setArchivedLists([]);
      return;
    }
    try {
      const data = await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ action: "list_archived", company_id: companyId, conversation_id: selectedConversationId }),
      });
      setArchivedLists(Array.isArray(data?.lists) ? data.lists : []);
    } catch {
      setArchivedLists([]);
    }
  };

  const unarchiveChatList = async (listId) => {
    if (!listId) return;
    setError("");
    try {
      await chatFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ action: "unarchive_list", company_id: companyId, list_id: String(listId) }),
      });
      setArchivedLists((prev) => (Array.isArray(prev) ? prev : []).filter((l) => String(l?.id) !== String(listId)));
      await refreshSelectedChatLists();
    } catch (err) {
      setError(chatErrorMessage(err));
    }
  };

  useEffect(() => {
    if (showArchivedLists && selectedConversationId) void loadArchivedLists();
    if (!showArchivedLists) setArchivedLists([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchivedLists, selectedConversationId]);

  const hasDraftMessage = Boolean(messageDraft.trim());

  const renderChatMessageRow = (message, showSenderName = true) => {
    const mine = String(message.sender_user_id) === String(currentUserId);
    const senderNameLabel = String(message.sender_name || "").trim();
    const senderNameIsEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderNameLabel);
    const replyBody = String(message?.metadata?.reply_to_body || "").trim();
    const replySender = String(message?.metadata?.reply_to_sender_name || "").trim();
    const replyCreatedAt = String(message?.metadata?.reply_to_created_at || "").trim();
    const attachmentRows = Array.isArray(message.attachments) ? message.attachments : [];
    const statusNode = renderChatMessageStatus(message);
    const replyToMessage = replyBody
      ? messagesById.get(String(message?.metadata?.reply_to_message_id)) || null
      : null;
    const messageBody = String(message.body || "").trim();
    const hideBodyForPhoto = message.message_type === "photo" && (!messageBody || /^photo$/i.test(messageBody));
    return (
      <div key={message.id || message.client_id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
        <div
          className="max-w-[82%] md:max-w-[72%]"
          onContextMenu={(event) => {
            event.preventDefault();
            openChatMessageMenu(message);
          }}
          onTouchStart={() => beginChatMessagePress(message)}
          onTouchEnd={clearChatMessagePressTimer}
          onTouchCancel={clearChatMessagePressTimer}
        >
          <div
            className={`overflow-hidden rounded-[18px] border px-3 py-2.5 ${
              mine
                ? "rounded-br-[6px] border-[#0B1F33] bg-[#0B1F33] text-white shadow-[0_2px_6px_rgba(6,20,38,0.18)]"
                : "rounded-bl-[6px] border-[#E6EAF1] bg-white text-[#061426] shadow-[0_1px_2px_rgba(6,20,38,0.06)]"
            }`}
          >
            {!mine && showSenderName ? (
              <p
                className={
                  senderNameIsEmail
                    ? "mb-1 text-[10px] font-semibold text-[#94A3B8]"
                    : "mb-1 text-[11px] font-black text-[#9A6B12]"
                }
              >
                {senderNameLabel}
              </p>
            ) : null}
            {replyBody ? (
              <button
                type="button"
                className={`mb-2 block w-full rounded-[14px] border px-3 py-2 text-left ${
                  mine ? "border-white/20 bg-white/10" : "border-[#E2E8F0] bg-[#F8FAFC]"
                }`}
                onClick={() => {
                  if (replyToMessage) openChatMessageMenu(replyToMessage);
                }}
              >
                <span className={`block text-[10px] font-black uppercase tracking-[0.08em] ${mine ? "text-[#F2C14E]" : "text-[#9A6B12]"}`}>
                  Replying to {replySender || "message"}
                </span>
                <span className={`mt-0.5 block truncate text-[12px] font-semibold ${mine ? "text-white/85" : "text-[#475569]"}`}>{replyBody}</span>
                {replyCreatedAt ? (
                  <span className={`mt-0.5 block text-[10px] font-bold ${mine ? "text-white/55" : "text-[#94A3B8]"}`}>{formatChatTime(replyCreatedAt)}</span>
                ) : null}
              </button>
            ) : null}
            {message.deleted ? (
              <p className={`text-[13px] font-semibold italic ${mine ? "text-white/65" : "text-[#64748B]"}`}>Message deleted</p>
            ) : (
              <>
                {message.message_type === "checklist" ? (
                  <div className="space-y-2">
                    <p className="whitespace-pre-wrap break-words text-[14px] font-black leading-snug">{messageBody}</p>
                    <div className="space-y-1">
                      {(message.checklist_items || []).map((item) => (
                        <label key={item.id} className={`flex items-center gap-2.5 rounded-[12px] px-2.5 py-1.5 ${mine ? "bg-white/12" : "bg-[#F4F7FB]"}`}>
                          <input
                            type="checkbox"
                            checked={Boolean(item.is_checked)}
                            onChange={() => void toggleChecklistItem(item)}
                            className={`shrink-0 ${mine ? "accent-[#F2C14E]" : "accent-[#061426]"}`}
                            style={{ width: 16, height: 16 }}
                          />
                          <span className={`min-w-0 flex-1 text-left text-[13px] font-semibold leading-snug ${item.is_checked ? "line-through opacity-70" : ""}`}>
                            {item.text}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {attachmentRows.length ? (
                      <div className="grid gap-2">
                        {attachmentRows.map((attachment) => (
                          <button
                            key={attachment.id}
                            type="button"
                            className="group relative block overflow-hidden rounded-[14px] border border-black/5 bg-white text-left"
                            onClick={() => openChatImageViewer(attachment, message)}
                          >
                            {attachment.public_url ? (
                              <img
                                src={attachment.public_url}
                                alt={attachment.file_name || "Chat attachment"}
                                className="max-h-72 w-full object-cover"
                              />
                            ) : (
                              <span className="block p-3 text-[12px] font-bold">Photo attachment</span>
                            )}
                            <span className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white shadow-md backdrop-blur-sm">
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M9 7h8v8" />
                                <path d="m8 16 9-9" />
                              </svg>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {!hideBodyForPhoto && messageBody ? (
                      <p className={`whitespace-pre-wrap break-words text-[14px] leading-snug ${attachmentRows.length ? "mt-2 font-medium" : "font-semibold"}`}>
                        {messageBody}
                      </p>
                    ) : null}
                  </>
                )}
              </>
            )}
            <div className={`mt-1.5 flex items-center justify-end gap-1.5 text-[10px] font-medium ${mine ? "text-white/60" : "text-[#94A3B8]"}`}>
              <span>{formatChatTime(message.created_at)}</span>
              {mine ? statusNode : null}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderChatListRibbonChip = (list) => {
    const listId = String(list?.id || "");
    const isSelected = String(selectedChatListId) === listId && chatPane === "list-detail";
    const openCount = Number(list?.open_count || 0);
    return (
      <button
        key={listId}
        type="button"
        className={`flex h-11 shrink-0 items-center gap-2 rounded-full border pl-2 pr-3.5 transition ${
          isSelected ? "border-[#163B5C] bg-[#163B5C] text-white" : "border-[#E6EAF1] bg-white text-[#061426] active:bg-[#F8FAFC]"
        }`}
        onClick={() => openChatListDetail(list.id)}
      >
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isSelected ? "bg-white/15" : "bg-[#FBF6EA] text-[#9A6B12]"}`}>
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 6h13M8 12h13M8 18h13" />
            <path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2" />
          </svg>
        </span>
        <span className="max-w-[120px] truncate text-[13px] font-bold">{list.title}</span>
        {openCount > 0 ? (
          <span className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-black ${
            isSelected ? "bg-white/20 text-white" : "bg-[#F2F5FA] text-[#64748B]"
          }`}>
            {openCount}
          </span>
        ) : null}
      </button>
    );
  };

  /* eslint-disable react-hooks/refs */
  const renderChatListDetailView = (list) => {
    const hierarchy = list.list_type === "home_depot" ? hdDisplayHierarchy : selectedChatListHierarchy;
    const isHd = list.list_type === "home_depot";
    const isPendingList = list.list_type === "pending_job";
    // Assigning an item to a person only makes sense with 3+ people. Hide it on
    // Home Depot lists and on direct (1:1) chats.
    const allowAssign = !isHd && selectedConversation?.type !== "direct";
    const assignableMembers = selectedChatAssignableMembers;
    const handleMainInputPointer = () => {
      chatListInputPointerAtRef.current = Date.now();
    };
    const handleSubInputPointer = () => {
      chatSubItemInputPointerAtRef.current = Date.now();
    };
    const handleMainInputBlur = (event) => {
      if (!shouldPreserveTouchedInputFocus(chatListInputPointerAtRef.current)) return;
      if (event.relatedTarget) return;
      if (typeof window === "undefined") return;
      requestAnimationFrame(() => restoreChatListInputFocus());
    };
    const handleSubInputBlur = (event) => {
      if (!shouldPreserveTouchedInputFocus(chatSubItemInputPointerAtRef.current)) return;
      if (event.relatedTarget) return;
      if (typeof window === "undefined") return;
      requestAnimationFrame(() => restoreChatSubItemInputFocus());
    };
    return (
      <div className="relative flex h-full min-h-0 flex-1 flex-col bg-white overflow-hidden">
        <input
          ref={tickCaptureInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            const item = tickCaptureItemRef.current;
            tickCaptureItemRef.current = null;
            if (file && item) void attachPhotoToListItem(item, file);
          }}
        />
        <div className="sticky top-0 z-20 border-b border-[#E2E8F0] bg-white px-3 py-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-[#F8FAFC] text-[#061426]"
              onClick={() => {
                setChatPane("thread");
                setEditingListItemId("");
                setEditingListItemText("");
                setAssigningListItemId("");
                setListItemDraft("");
              }}
              aria-label="Back to chat"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            {listTitleDraft === null ? (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FBF8F1] text-[#9A6B12]">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 6h13M8 12h13M8 18h13" />
                  <path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2" />
                </svg>
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              {listTitleDraft !== null ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      className="chat-mobile-safe-input h-10 min-w-0 flex-1 rounded-[12px] border border-[#CBD5E1] bg-white px-3 text-[16px] font-black text-[#061426] outline-none focus:border-[#061426]"
                      style={{ fontSize: 16 }}
                      value={listTitleDraft}
                      maxLength={120}
                      placeholder="List name"
                      onChange={(event) => setListTitleDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void saveListTitle(list);
                        }
                        if (event.key === "Escape") setListTitleDraft(null);
                      }}
                    />
                    <button
                      type="button"
                      className="h-10 shrink-0 rounded-[12px] bg-[#061426] px-3.5 text-[13px] font-black text-white disabled:opacity-60"
                      disabled={listTitleSaving}
                      onClick={() => void saveListTitle(list)}
                    >
                      {listTitleSaving ? "…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[#CBD5E1] bg-white text-[#64748B]"
                      onClick={() => setListTitleDraft(null)}
                      aria-label="Cancel rename"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M6 6 18 18" /><path d="M18 6 6 18" />
                      </svg>
                    </button>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#94A3B8]">List type</p>
                    <div className="flex gap-1.5">
                      {[
                        { id: "home_depot", label: "Home Depot" },
                        { id: "pending_job", label: "Pending job" },
                        { id: "other", label: "Other" },
                      ].map((opt) => (
                        <button
                          key={`type-${opt.id}`}
                          type="button"
                          className={`h-9 flex-1 rounded-[10px] border px-1 text-[11px] font-black leading-tight ${
                            listTypeDraft === opt.id ? "border-[#061426] bg-[#061426] text-white" : "border-[#CBD5E1] bg-white text-[#061426]"
                          }`}
                          onClick={() => setListTypeDraft(opt.id)}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className="flex max-w-full items-center gap-1.5 text-left"
                    onClick={() => {
                      setListTitleDraft(String(list.title || ""));
                      setListTypeDraft(String(list.list_type || "other"));
                    }}
                    aria-label="Rename list"
                  >
                    <h2 className="truncate text-[17px] font-black text-[#061426]">{list.title}</h2>
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-[#94A3B8]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <p className="truncate text-[11px] font-semibold text-[#64748B]">
                    {list.open_count} open / {list.total_count} total
                  </p>
                </>
              )}
            </div>
            <div className={`${listTitleDraft === null ? "flex" : "hidden"} shrink-0 items-center gap-1`}>
              <button
                type="button"
                className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                  selectedChatListShowCompleted
                    ? "border-[#061426] bg-[#061426] text-white"
                    : "border-[#E2E8F0] bg-[#F8FAFC] text-[#061426]"
                }`}
                onClick={() => setSelectedChatListShowCompleted((prev) => !prev)}
                aria-pressed={selectedChatListShowCompleted}
                aria-label={selectedChatListShowCompleted ? "Hide completed items" : "Show completed items"}
              >
                <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {selectedChatListShowCompleted ? (
                    <>
                      <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6Z" />
                      <path d="M9.5 12a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0Z" />
                    </>
                  ) : (
                    <>
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5" />
                      <path d="M6.2 6.8C3.9 8.4 2 12 2 12s4 6 10 6c1.2 0 2.4-.2 3.5-.6" />
                      <path d="M14.8 5.1C16.9 5.8 18.9 7.3 22 12c0 0-.8 1.2-2.1 2.5" />
                    </>
                  )}
                </svg>
              </button>
              {list.can_archive ? (
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E2E8F0] bg-[#F8FAFC] text-[#061426]"
                  onClick={() => void archiveChatList()}
                  aria-label="Archive list"
                >
                  <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 7h16" />
                    <path d="M6 7v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
                    <path d="M9 11h6" />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>
          {list.list_type === "home_depot" ? (
            <div className="mt-2 flex items-center gap-2 rounded-[12px] border border-[#FDE6C8] bg-[#FFF7EC] px-3 py-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[#F96302] text-[12px] font-black text-white">HD</span>
              {storeNameDraft !== null ? (
                <>
                  <input
                    inputMode="text"
                    autoComplete="off"
                    className="chat-mobile-safe-input h-9 min-w-0 flex-1 rounded-[10px] border border-[#F5C99A] bg-white px-2 text-[15px] font-semibold text-[#061426] outline-none"
                    style={{ fontSize: 16 }}
                    value={storeNameDraft}
                    maxLength={80}
                    onChange={(event) => setStoreNameDraft(event.target.value)}
                    placeholder="Store (e.g. Nepean)"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="h-9 shrink-0 rounded-[10px] bg-[#061426] px-3 text-[12px] font-black text-white disabled:bg-[#CBD5E1]"
                    disabled={storeNameSaving}
                    onClick={() => void saveListStoreName(list)}
                  >
                    {storeNameSaving ? "…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="h-9 shrink-0 rounded-[10px] border border-[#CBD5E1] bg-white px-2 text-[12px] font-black text-[#64748B]"
                    onClick={() => setStoreNameDraft(null)}
                  >
                    ✕
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
                  onClick={() => setStoreNameDraft(list.store_name || "")}
                >
                  <span className="min-w-0">
                    <span className="block text-[10px] font-black uppercase tracking-[0.08em] text-[#9A6B12]">Home Depot store</span>
                    <span className="block truncate text-[15px] font-black text-[#061426]">{list.store_name || "Tap to set store"}</span>
                  </span>
                  <span className="shrink-0 text-[11px] font-black text-[#9A6B12]">Edit</span>
                </button>
              )}
            </div>
          ) : null}
          {list.list_type === "home_depot" && list.store_name ? (
            <label className={`mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[12px] border border-[#DDEAFE] bg-[#EEF4FF] px-3 py-2 text-[12px] font-black text-[#2563EB] ${hdLearnBusy ? "opacity-60" : "active:bg-[#DDEAFE]"}`}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              {hdLearnBusy ? "Reading aisle…" : "Learning picture — scan an aisle sign"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={hdLearnBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void handleHdAisleScan(file);
                }}
              />
            </label>
          ) : null}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto bg-white px-3 py-3 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          {hierarchy.length === 0 ? (
            <EmptyState
              title={list.total_count > 0 ? "Completed items hidden" : "No list items"}
              body={list.total_count > 0 ? "Tap the eye to show completed items." : "Add the first item below."}
            />
          ) : (
            (dragOrder && !isHd
              ? dragOrder.map((id) => hierarchy.find((i) => String(i.id) === id)).filter(Boolean)
              : hierarchy
            ).map((item, itemIndex) => {
              const editingThis = String(editingListItemId) === String(item.id);
              const assigningThis = String(assigningListItemId) === String(item.id);
              const assignee = getChatListAssigneeMeta(item);
              const legacySubitems = item.legacySubitems || [];
              const isDraggingThis = dragItemId != null && String(dragItemId) === String(item.id);
              const canReorder = !isHd && Number(item?.item_level || 0) === 0;
              return (
                <div
                  key={item.id}
                  ref={(el) => {
                    if (el) chatRowElsRef.current[String(item.id)] = el;
                    else delete chatRowElsRef.current[String(item.id)];
                  }}
                  className={`rounded-[18px] border px-3 py-3 shadow-sm transition-[transform,box-shadow] ${
                    item.is_done ? "border-[#DDE7DD] bg-[#F8FAFC]" : "border-[#E2E8F0] bg-[#F8FAFC]"
                  } ${isDraggingThis ? "scale-[1.02] border-[#061426] bg-white shadow-[0_16px_40px_rgba(6,20,38,0.22)]" : dragItemId ? "opacity-90" : ""}`}
                  style={{ touchAction: dragItemId ? "none" : "pan-y" }}
                  onTouchStart={(event) => beginChatListSwipe(item.id, event.changedTouches?.[0]?.clientX, event.changedTouches?.[0]?.clientY)}
                  onTouchEnd={(event) => endChatListSwipe(item, event.changedTouches?.[0]?.clientX, event.changedTouches?.[0]?.clientY)}
                >
                  <div className="flex items-start gap-2">
                    {canReorder ? (
                      <button
                        type="button"
                        aria-label={`Drag to reorder item ${itemIndex + 1}`}
                        title="Hold and drag to reorder"
                        className={`mt-0.5 flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-[6px] text-[#94A3B8] active:cursor-grabbing ${isDraggingThis ? "text-[#061426]" : ""}`}
                        style={{ touchAction: "none" }}
                        onPointerDown={(event) => beginListItemPress(item, event)}
                        onPointerMove={(event) => moveListItemPress(event)}
                        onPointerUp={() => void endListItemPress()}
                        onPointerCancel={() => void endListItemPress()}
                        onClick={(event) => event.preventDefault()}
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                          <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
                          <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                          <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
                        </svg>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={Boolean(item.is_done)}
                      aria-label={`${item.is_done ? "Mark open" : "Mark complete"}: ${item.text}`}
                      onClick={() => {
                        const willComplete = !item.is_done;
                        void toggleChatListItem(item);
                        // Auto-open the camera when marking complete — only on
                        // Home Depot lists (proof-of-purchase photo), not other
                        // list types.
                        if (willComplete && list.list_type === "home_depot" && tickCaptureInputRef.current) {
                          tickCaptureItemRef.current = item;
                          try {
                            tickCaptureInputRef.current.click();
                          } catch {
                            /* ignore — some browsers block programmatic file inputs */
                          }
                        }
                      }}
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-white transition ${
                        item.is_done ? "border-[#15803D] bg-[#15803D]" : "border-[#CBD5E1] bg-white"
                      }`}
                    >
                      {item.is_done ? (
                        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m3.2 8.3 3 3 6.5-6.6" />
                        </svg>
                      ) : null}
                    </button>
                    {allowAssign ? (
                      <button
                        type="button"
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-black ${
                          assignee ? "border-[#E7D9B0] bg-[#FBF6EA] text-[#9A6B12]" : "border-[#E2E8F0] bg-white text-[#94A3B8]"
                        }`}
                        onClick={() => {
                          setAssigningListItemId((current) => (String(current) === String(item.id) ? "" : String(item.id)));
                          setEditingListItemId("");
                          setEditingListItemText("");
                        }}
                        aria-label={assignee ? `Assigned to ${assignee.name}` : `Assign employee to item ${item.item_number}`}
                      >
                        {assignee ? (
                          assignee.initial
                        ) : (
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
                            <path d="M4 20a8 8 0 0 1 16 0" />
                          </svg>
                        )}
                      </button>
                    ) : null}
                    <div className="min-w-0 flex-1">
                      {editingThis ? (
                        <div className="space-y-2">
                          <input
                            ref={chatListEditInputRef}
                            className="h-10 w-full rounded-[12px] border border-[#CBD5E1] bg-white px-3 text-[16px] font-semibold text-[#061426] outline-none focus:border-[#061426]"
                            value={editingListItemText}
                            onChange={(event) => setEditingListItemText(event.target.value)}
                            onFocus={(event) => {
                              const valueLength = String(event.target.value || "").length;
                              event.target.setSelectionRange?.(0, valueLength);
                            }}
                            autoFocus
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void saveChatListItemEdit(item);
                              }
                              if (event.key === "Escape") {
                                setEditingListItemId("");
                                setEditingListItemText("");
                              }
                            }}
                            onBlur={() => {
                              const liveValue = normalizeChatListItemDraftText(chatListEditInputRef.current?.value || editingListItemText);
                              if (!liveValue) {
                                setEditingListItemId("");
                                setEditingListItemText("");
                                return;
                              }
                              void saveChatListItemEdit(item);
                            }}
                          />
                          {allowAssign ? (
                            <select
                              className="chat-mobile-safe-input h-11 w-full rounded-[12px] border border-[#CBD5E1] bg-white px-3 text-[16px] font-semibold leading-normal text-[#061426] outline-none focus:border-[#163B5C]"
                              value={String(item?.assigned_user_id || "")}
                              onChange={(event) => void assignChatListItem(item, event.target.value)}
                            >
                              <option value="">Unassigned</option>
                              {assignableMembers.map((member) => (
                                <option key={`assign-${item.id}-${member.user_id}`} value={member.user_id}>
                                  {member.name}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="rounded-full border border-[#E2E8F0] bg-white px-3 py-1 text-[11px] font-bold text-[#061426]"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => void reparentChatListItemAction(item, "")}
                            >
                              Main item
                            </button>
                            {hierarchy
                              .filter((candidate) => String(candidate.id) !== String(item.id))
                              .slice(0, 4)
                              .map((candidate) => (
                                <button
                                  key={`parent-${candidate.id}`}
                                  type="button"
                                  className="rounded-full border border-[#E2E8F0] bg-white px-3 py-1 text-[11px] font-bold text-[#163B5C]"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => void reparentChatListItemAction(item, candidate.id)}
                                >
                                  Under {candidate.item_number}
                                </button>
                              ))}
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={`block w-full rounded-[12px] px-1 py-0.5 text-left text-[15px] font-bold leading-snug text-[#061426] ${
                            item.is_done ? "opacity-60" : ""
                          }`}
                          onClick={() => {
                            setAssigningListItemId("");
                            setEditingListItemId(item.id);
                            setEditingListItemText(normalizeChatListItemDraftText(item.text || ""));
                          }}
                          aria-label={`Edit item ${item.item_number}`}
                        >
                          <span className="mr-1 text-[#64748B]">{isHd ? item.item_number : itemIndex + 1}.</span>
                          <span className={item.is_done ? "line-through" : ""}>{normalizeChatListItemDraftText(item.text)}</span>
                        </button>
                      )}
                      {item.photo_url && !editingThis ? (
                        <a href={item.photo_url} target="_blank" rel="noopener noreferrer" className="mt-1.5 block w-fit">
                          <img src={item.photo_url} alt="Item" className="h-14 w-14 rounded-[10px] border border-[#E2E8F0] object-cover" loading="lazy" />
                        </a>
                      ) : null}
                      {assigningThis && !editingThis && allowAssign ? (
                        <div className="mt-2">
                          <select
                            className="chat-mobile-safe-input h-11 w-full rounded-[12px] border border-[#CBD5E1] bg-white px-3 text-[16px] font-semibold leading-normal text-[#061426] outline-none focus:border-[#163B5C]"
                            value={String(item?.assigned_user_id || "")}
                            onChange={(event) => void assignChatListItem(item, event.target.value)}
                          >
                            <option value="">Unassigned</option>
                            {assignableMembers.map((member) => (
                              <option key={`inline-assign-${item.id}-${member.user_id}`} value={member.user_id}>
                                {member.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                      {item.is_done ? (
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#15803D]">Completed</p>
                          {isHd && !editingThis ? (
                            <label
                              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#FDE6C8] bg-[#FFF7EC] px-2.5 py-1 text-[11px] font-black text-[#9A6B12] ${hdCaptureBusy === String(item.id) ? "opacity-60" : "active:bg-[#FDEBD5]"}`}
                            >
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
                                <circle cx="12" cy="13" r="4" />
                              </svg>
                              {hdCaptureBusy === String(item.id) ? "Reading…" : item.hd_exact_name ? "Re-scan product" : "Capture product"}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={Boolean(hdCaptureBusy)}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.target.value = "";
                                  if (file) void captureHdItemPhoto(item, file);
                                }}
                              />
                            </label>
                          ) : null}
                        </div>
                      ) : null}
                      {isHd && (item.hd_exact_name || item.hd_price != null) && !editingThis ? (
                        <p className="mt-1 text-[12px] font-bold text-[#334155]">
                          {item.hd_exact_name || ""}
                          {item.hd_price != null ? <span className="ml-1 text-[#15803D]">${Number(item.hd_price).toFixed(2)}</span> : null}
                        </p>
                      ) : null}
                      {isHd && !editingThis && !item.is_done ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {item.department ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF4FF] px-2 py-0.5 text-[10px] font-black text-[#2563EB]">
                              {item.department}
                            </span>
                          ) : hdClassifying ? (
                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-400">Sorting…</span>
                          ) : null}
                          {item.department && hdAisleByDept[item.department] ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[10px] font-black text-[#15803D]">
                              Aisle {hdAisleByDept[item.department]}
                            </span>
                          ) : item.department ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-full border border-dashed border-[#CBD5E1] bg-white px-2 py-0.5 text-[10px] font-black text-[#64748B]"
                              onClick={() => { setHdAisleEditDept(item.department); setHdAisleDraft(""); }}
                            >
                              Set aisle
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#FDE6C8] bg-[#FFF7EC] px-2.5 py-1 text-[11px] font-black text-[#9A6B12] active:bg-[#FDEBD5]"
                            onClick={() => openHomeDepotSearch(item.text)}
                          >
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M20 20l-3.5-3.5" />
                              <circle cx="11" cy="11" r="6" />
                            </svg>
                            Find in store
                          </button>
                          {hdAisleEditDept && hdAisleEditDept === item.department ? (
                            <span className="inline-flex items-center gap-1">
                              <input
                                inputMode="numeric"
                                className="chat-mobile-safe-input h-8 w-16 rounded-[10px] border border-[#CBD5E1] bg-white px-2 text-[15px] font-black text-[#061426] outline-none"
                                style={{ fontSize: 16 }}
                                value={hdAisleDraft}
                                onChange={(e) => setHdAisleDraft(e.target.value)}
                                placeholder="Aisle"
                                autoFocus
                              />
                              <button type="button" className="h-8 rounded-[10px] bg-[#061426] px-2 text-[11px] font-black text-white" onClick={() => void confirmHdAisle(item.department)}>Save</button>
                              <button type="button" className="h-8 rounded-[10px] border border-[#CBD5E1] bg-white px-2 text-[11px] font-black text-[#64748B]" onClick={() => setHdAisleEditDept(null)}>✕</button>
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {legacySubitems.length ? (
                        <div className="mt-2 space-y-2 pl-3">
                          {legacySubitems.map((subitem, legacyIndex) => (
                            <div key={`${item.id}-legacy-${legacyIndex}`} className="flex items-center gap-2 border-t border-[#EEF2F7] pt-2 first:border-t-0 first:pt-0">
                              <span className="h-4 w-4 rounded-full border border-[#C4D2E3]" />
                              <span className="text-[13px] font-medium text-[#64748B]">{subitem}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {(item.children || []).length ? (
                        <div className="mt-2 space-y-2 pl-3">
                          {item.children.map((child) => {
                            const editingChild = String(editingListItemId) === String(child.id);
                            return (
                              <div
                                key={child.id}
                                className="flex items-start gap-2 rounded-[14px] border border-[#ECE8FF] bg-white px-2.5 py-2"
                                style={{ touchAction: "pan-y" }}
                                onTouchStart={(event) => beginChatListSwipe(child.id, event.changedTouches?.[0]?.clientX, event.changedTouches?.[0]?.clientY)}
                                onTouchEnd={(event) => endChatListSwipe(child, event.changedTouches?.[0]?.clientX, event.changedTouches?.[0]?.clientY)}
                              >
                                {isPendingList ? (
                                  <div className="mt-0.5 flex shrink-0 items-center gap-0.5" role="group" aria-label="Category (H = Home Depot, T = Tool)">
                                    {CHAT_SUBTASK_CATEGORIES.filter((cat) => cat.key !== "O").map((cat) => {
                                      const activeCat = String(child.department || "") === cat.value;
                                      return (
                                        <button
                                          key={cat.key}
                                          type="button"
                                          onClick={() =>
                                            cat.key === "H"
                                              ? void setChatSubtaskHomeDepot(child, !activeCat)
                                              : void setChatSubtaskCategory(child, cat.value)
                                          }
                                          aria-pressed={activeCat}
                                          aria-label={`Tag as ${cat.title}`}
                                          title={cat.title}
                                          className={`flex h-6 w-6 items-center justify-center rounded-[7px] border text-[11px] font-black leading-none ${
                                            activeCat
                                              ? "border-[#061426] bg-[#061426] text-white"
                                              : "border-[#D3DCEA] bg-white text-[#94A3B8]"
                                          }`}
                                        >
                                          {cat.short}
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : null}
                                <button
                                  type="button"
                                  role="checkbox"
                                  aria-checked={Boolean(child.is_done)}
                                  onClick={() => void toggleChatListItem(child)}
                                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-white transition ${
                                    child.is_done ? "border-[#15803D] bg-[#15803D]" : "border-[#C4D2E3] bg-white"
                                  }`}
                                >
                                  {child.is_done ? (
                                    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                      <path d="m3.2 8.3 3 3 6.5-6.6" />
                                    </svg>
                                  ) : null}
                                </button>
                                <div className="min-w-0 flex-1">
                                  {editingChild ? (
                                    <div className="space-y-2">
                                      <input
                                        ref={chatListEditInputRef}
                                        className="h-9 w-full rounded-[10px] border border-[#CBD5E1] bg-white px-3 text-[15px] font-semibold text-[#061426] outline-none focus:border-[#061426]"
                                        value={editingListItemText}
                                        onChange={(event) => setEditingListItemText(event.target.value)}
                                        autoFocus
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            void saveChatListItemEdit(child);
                                          }
                                          if (event.key === "Escape") {
                                            setEditingListItemId("");
                                            setEditingListItemText("");
                                          }
                                        }}
                                        onBlur={() => void saveChatListItemEdit(child)}
                                      />
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className="block w-full text-left text-[13px] font-medium text-[#475569]"
                                      onClick={() => {
                                        setAssigningListItemId("");
                                        setEditingListItemId(child.id);
                                        setEditingListItemText(normalizeChatListItemDraftText(child.text || ""));
                                      }}
                                    >
                                      {normalizeChatListItemDraftText(child.text)}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                      {String(addingSubItemParentId) === String(item.id) ? (
                        <div className="mt-2 flex gap-2 pl-3">
                          <input
                            ref={chatSubItemInputRef}
                            className="chat-mobile-safe-input h-10 min-w-0 flex-1 rounded-[12px] border border-[#CBD5E1] bg-white px-3 text-[16px] font-semibold text-[#061426] outline-none focus:border-[#163B5C]"
                            value={subItemDraft}
                            autoComplete="off"
                            inputMode="text"
                            enterKeyHint="done"
                            onPointerDown={handleSubInputPointer}
                            onMouseDown={handleSubInputPointer}
                            onTouchStart={handleSubInputPointer}
                            onChange={(event) => setSubItemDraft(event.target.value)}
                            placeholder="Add sub-item"
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void addChatListItem(item);
                              }
                              if (event.key === "Escape") {
                                setAddingSubItemParentId("");
                                setSubItemDraft("");
                              }
                            }}
                            onBlur={handleSubInputBlur}
                          />
                          <button
                            type="button"
                            className="h-10 rounded-[12px] bg-[#061426] px-3 text-[12px] font-black text-white disabled:bg-[#CBD5E1]"
                            disabled={!subItemDraft.trim() || listBusy}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => void addChatListItem(item)}
                          >
                            Add
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex shrink-0 items-center gap-1">
                      <label
                        className={`flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border ${
                          item.photo_url ? "border-[#15803D] bg-[#ECFDF5] text-[#15803D]" : "border-[#E2E8F0] bg-white text-[#94A3B8]"
                        } ${listPhotoBusy === String(item.id) ? "opacity-60" : "active:bg-[#F1F5F9]"}`}
                        aria-label={item.photo_url ? `Replace photo on item ${item.item_number}` : `Add photo to item ${item.item_number}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {listPhotoBusy === String(item.id) ? (
                          <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.5" strokeLinecap="round" /></svg>
                        ) : (
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
                            <circle cx="12" cy="13" r="4" />
                          </svg>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={Boolean(listPhotoBusy)}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (file) void attachPhotoToListItem(item, file);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[20px] font-black leading-none text-[#061426] shadow-[0_4px_12px_rgba(6,20,38,0.08)] active:bg-[#F8FAFC]"
                        onClick={() => {
                          setAddingSubItemParentId((current) => (String(current) === String(item.id) ? "" : String(item.id)));
                          setSubItemDraft("");
                          setAssigningListItemId("");
                        }}
                        aria-label={`Add sub-item under item ${item.item_number}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="sticky bottom-0 border-t border-[#E2E8F0] bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          {isHd ? (
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-[#CBD5E1] bg-white px-3 py-1.5 text-[12px] font-black text-[#334155] active:bg-[#F8FAFC]"
                onClick={() => { setHdPickerDept(""); setHdPickerOpen(true); }}
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
                </svg>
                Browse products{hdCatalog.length ? ` (${hdCatalog.length})` : ""}
              </button>
            </div>
          ) : null}
          <div className="relative flex gap-2" onPointerDownCapture={(event) => event.stopPropagation()} onMouseDownCapture={(event) => event.stopPropagation()}>
            {isHd && hdSuggestions.length ? (
              <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-[14px] border border-[#E2E8F0] bg-white shadow-lg">
                {hdSuggestions.map((s) => (
                  <button
                    key={`sugg-${s.id}`}
                    type="button"
                    className="flex w-full items-center gap-2 border-b border-[#F1F5F9] px-3 py-2 text-left last:border-b-0 active:bg-[#F8FAFC]"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setListItemDraft(String(s.exact_name || s.typed_name || ""));
                      setHdSuggestOpen(false);
                    }}
                  >
                    {s.photo_url ? (
                      <img src={s.photo_url} alt="" className="h-8 w-8 rounded-md border border-[#E2E8F0] object-cover" loading="lazy" />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#F1F5F9] text-[10px] font-black text-[#94A3B8]">HD</span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-[#061426]">{s.exact_name || s.typed_name}</span>
                      <span className="block truncate text-[11px] font-semibold text-[#94A3B8]">
                        {s.department || "Product"}{s.last_price != null ? ` · $${Number(s.last_price).toFixed(2)}` : ""}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
            <input
              ref={chatListItemInputRef}
              className="chat-mobile-safe-input h-11 min-w-0 flex-1 rounded-[14px] border border-[#CBD5E1] bg-white px-3 text-[16px] font-semibold text-[#061426] outline-none focus:border-[#061426]"
              value={listItemDraft}
              autoComplete="off"
              inputMode="text"
              enterKeyHint="done"
              onPointerDown={handleMainInputPointer}
              onMouseDown={handleMainInputPointer}
              onTouchStart={handleMainInputPointer}
              onFocus={() => { if (isHd) setHdSuggestOpen(true); }}
              onChange={(event) => { setListItemDraft(event.target.value); if (isHd) setHdSuggestOpen(true); }}
              placeholder="Add main item"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  setHdSuggestOpen(false);
                  void addChatListItem();
                }
              }}
              onBlur={handleMainInputBlur}
            />
            <label
              className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-[14px] border border-[#CBD5E1] bg-white text-[#061426] ${listPhotoBusy === "new" ? "opacity-60" : "active:bg-[#F8FAFC]"}`}
              aria-label="Add photo item (camera or gallery)"
              onPointerDown={(event) => event.stopPropagation()}
            >
              {listPhotoBusy === "new" ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5 animate-spin text-[#94A3B8]" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.5" strokeLinecap="round" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={Boolean(listPhotoBusy)}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void addPhotoListItem(file);
                }}
              />
            </label>
            <button
              type="button"
              className="h-11 rounded-[14px] bg-[#061426] px-4 text-[13px] font-black text-white disabled:bg-[#CBD5E1]"
              disabled={!listItemDraft.trim() || listBusy}
              onPointerDown={(event) => event.preventDefault()}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void addChatListItem()}
            >
              Add
            </button>
          </div>
        </div>
        {hdPickerOpen ? (
          <div className="absolute inset-0 z-40 flex flex-col bg-black/40" onClick={() => setHdPickerOpen(false)}>
            <div className="mt-auto flex max-h-[80%] flex-col rounded-t-[22px] bg-white" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
                <div>
                  <p className="text-[15px] font-black text-[#061426]">Browse products</p>
                  <p className="text-[12px] font-semibold text-[#94A3B8]">Tap a saved product to add it to this list.</p>
                </div>
                <button type="button" className="flex h-9 w-9 items-center justify-center rounded-full border border-[#CBD5E1] bg-white text-[#64748B]" onClick={() => setHdPickerOpen(false)} aria-label="Close">✕</button>
              </div>
              {(() => {
                const depts = Array.from(new Set(hdCatalog.map((r) => r.department).filter(Boolean))).sort();
                return depts.length ? (
                  <div className="flex gap-2 overflow-x-auto border-b border-[#F1F5F9] px-4 py-2">
                    <button type="button" className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-black ${!hdPickerDept ? "bg-[#061426] text-white" : "bg-[#F1F5F9] text-[#64748B]"}`} onClick={() => setHdPickerDept("")}>All</button>
                    {depts.map((d) => (
                      <button key={`pf-${d}`} type="button" className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-black ${hdPickerDept === d ? "bg-[#061426] text-white" : "bg-[#F1F5F9] text-[#64748B]"}`} onClick={() => setHdPickerDept(d)}>{d}</button>
                    ))}
                  </div>
                ) : null;
              })()}
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {(() => {
                  const products = hdCatalog.filter((r) => (r.exact_name || r.typed_name) && (!hdPickerDept || r.department === hdPickerDept));
                  if (!products.length) {
                    return <p className="py-8 text-center text-[13px] font-semibold text-[#94A3B8]">No saved products yet. Tick an item and capture its photo to learn products.</p>;
                  }
                  return (
                    <div className="grid grid-cols-2 gap-2">
                      {products.map((p) => (
                        <button
                          key={`pp-${p.id}`}
                          type="button"
                          disabled={hdPickerBusy}
                          className="flex flex-col overflow-hidden rounded-[14px] border border-[#E2E8F0] bg-white text-left active:bg-[#F8FAFC] disabled:opacity-60"
                          onClick={() => void addCatalogItemToList(p)}
                        >
                          {p.photo_url ? (
                            <img src={p.photo_url} alt="" className="h-24 w-full object-cover" loading="lazy" />
                          ) : (
                            <span className="flex h-24 w-full items-center justify-center bg-[#F1F5F9] text-[12px] font-black text-[#94A3B8]">No photo</span>
                          )}
                          <span className="flex-1 px-2 py-1.5">
                            <span className="block truncate text-[12px] font-bold text-[#061426]">{p.exact_name || p.typed_name}</span>
                            <span className="block truncate text-[11px] font-semibold text-[#94A3B8]">
                              {p.department || "Product"}{p.last_price != null ? ` · $${Number(p.last_price).toFixed(2)}` : ""}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  };
  /* eslint-enable react-hooks/refs */


  return (
    <PageCard
      className={`overflow-hidden ${
        isImmersivePane ? "min-h-full h-full border-0 rounded-none bg-transparent shadow-none" : ""
      }`}
    >
      <div
        ref={chatGridRef}
        className={`overflow-hidden bg-white ${
          isImmersivePane ? "min-h-full h-full" : "min-h-[calc(100dvh-150px)]"
        }`}
      >
        <aside className={`${chatPane === "thread" || chatPane === "list-detail" ? "hidden" : "flex"} min-h-[calc(100dvh-150px)] flex-col bg-[#F4F7FB] px-3 pb-3 pt-3`}>
          <div className="rounded-[24px] bg-white px-3.5 pb-3 pt-3 shadow-[0_12px_30px_rgba(6,20,38,0.06)]">
            <div className="flex items-center justify-between gap-3">
              <h1 className="truncate text-[20px] font-black leading-tight text-[#061426]">Chats</h1>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E6EAF1] bg-white text-[#061426] active:bg-[#F8FAFC]"
                  onClick={() => void loadConversations()}
                  aria-label="Sync chats"
                >
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12a9 9 0 0 1-15.5 6.4" />
                    <path d="M3 12A9 9 0 0 1 18.5 5.6" />
                    <path d="M8 17H5v3" />
                    <path d="M16 7h3V4" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E6EAF1] bg-white text-[#061426] active:bg-[#F8FAFC]"
                  onClick={() => setChatFilter((current) => (current === "groups" ? "all" : "groups"))}
                  aria-label="Filter group chats"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 6h16" />
                    <path d="M7 12h10" />
                    <path d="M10 18h4" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#061426] text-white shadow-[0_10px_22px_rgba(6,20,38,0.16)] active:bg-[#0B1F33]"
                  onClick={() => setComposerOpen("direct")}
                  aria-label="Start chat"
                >
                  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 12a8 8 0 0 1-8 8H8l-5 2 1.8-4.6A8 8 0 1 1 21 12Z" />
                    <path d="M12 8v8M8 12h8" />
                  </svg>
                </button>
              </div>
            </div>

            <label className="mt-2.5 flex h-11 items-center gap-3 rounded-[16px] border border-[#E6EAF1] bg-[#F8FAFC] px-3.5">
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#64748B]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                value={chatSearch}
                onChange={(event) => setChatSearch(event.target.value)}
                className="h-full min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[#061426] outline-none placeholder:text-[#94A3B8]"
                placeholder="Search chats..."
              />
            </label>
            <div className="opera-hide-scrollbar mt-2.5 flex items-center gap-2 overflow-x-auto">
              {[
                { key: "all", label: "All", count: chatFilterCounts.all },
                { key: "pinned", label: "Pinned", count: chatFilterCounts.pinned },
                { key: "groups", label: "Groups", count: chatFilterCounts.groups },
              ].map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  className={`flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[12px] font-black ${
                    chatFilter === filter.key
                      ? "bg-[#061426] text-white shadow-[0_12px_24px_rgba(6,20,38,0.15)]"
                      : "border border-[#E2E8F0] bg-white text-[#061426]"
                  }`}
                  onClick={() => setChatFilter(filter.key)}
                >
                  <span>{filter.label}</span>
                  <span className={`inline-flex min-w-[20px] items-center justify-center rounded-full px-1 py-0.5 text-[10px] ${
                    chatFilter === filter.key ? "bg-white/18 text-white" : "bg-[#F2F5FA] text-[#64748B]"
                  }`}>
                    {filter.count}
                  </span>
                </button>
              ))}
            </div>
            {error ? (
              <div className="mt-3 rounded-[16px] border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-bold text-red-700">
                {error}
              </div>
            ) : null}
          </div>

          <div className="opera-scroll min-h-0 flex-1 overflow-y-auto pt-3">
            {loading ? (
              <p className="p-4 text-[14px] font-semibold text-[#64748B]">Loading chats...</p>
            ) : visibleConversationRows.length === 0 ? (
              <EmptyState icon={chatEmptyStateIcon} title="No chats found" body="Start a direct chat or create a group." className="m-3" />
            ) : (
              visibleConversationRows.map((conversation) => {
                const activeConversation =
                  String(conversation.id) === String(selectedConversationId) ||
                  (!selectedConversationId && String(conversation.id).startsWith("__company_"));
                const name = displayConversationName(conversation);
                const initials = name.slice(0, 2).toUpperCase();
                const preview =
                  conversation.pendingSetup
                    ? "Company-wide chat"
                    : conversation.last_message || (conversation.type === "company" ? "Company-wide chat" : "No messages yet");
                const unreadCount = Number(conversation?.unread_count || conversation?.unreadCount || 0);
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    className={`mx-0.5 mb-1.5 flex w-[calc(100%-0.25rem)] items-center gap-3 rounded-[18px] border px-3 py-2.5 text-left transition active:scale-[0.995] ${
                      activeConversation ? "border-[#BCD2E8] bg-[#F3F7FC]" : "border-transparent bg-white active:bg-[#F8FAFC]"
                    }`}
                    onClick={() => {
                      openChatConversation(conversation.id);
                    }}
                  >
                    <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[14px] font-black text-white ${
                      conversation.type === "company" ? "bg-[#0B1F33]" : "bg-[#163B5C]"
                    }`}>
                      {initials}
                      {conversation.type === "company" ? <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-[#22C55E]" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 flex-1 truncate text-[15px] font-black text-[#061426]">{name}</span>
                        {conversation.type === "group" ? <span className="shrink-0 rounded-full bg-[#FBF6EA] px-1.5 py-0.5 text-[9px] font-black text-[#9A6B12]">Group</span> : null}
                        {conversation.pinned ? (
                          <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 text-[#9A6B12]" fill="currentColor" stroke="none" aria-hidden="true">
                            <path d="m12 17 4 4v-7l4-4V5H9l-5 5h7v11Z" />
                          </svg>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate text-[13px] font-semibold text-[#64748B]">
                        {preview}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1 text-[11px] font-bold text-[#94A3B8]">
                      <span>{formatChatTime(conversation.last_message_at)}</span>
                      {unreadCount > 0 ? (
                        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#061426] px-1.5 text-[10px] font-black text-white">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <section
          ref={chatSectionRef}
          className={`${chatPane === "list" ? "hidden" : "flex"} relative flex-col bg-[#F4F7FB] ${
            isImmersivePane ? "min-h-full h-full" : "min-h-[calc(100dvh-150px)]"
          }`}
        >
          {selectedConversation ? (
            <>
              <div className="sticky top-0 z-10 border-b border-[#E6EAF1] bg-white/96 px-3 pb-2 pt-3 backdrop-blur">
                <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#E6EAF1] bg-white text-[#061426] shadow-[0_8px_18px_rgba(6,20,38,0.08)] active:bg-[#F8FAFC]"
                  onClick={() => setChatPane("list")}
                  aria-label="Back to chats"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m15 18-6-6 6-6" />
                  </svg>
                </button>
                <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full ${
                  selectedConversation.type === "direct" ? "bg-[#0B1F33] text-white" : "bg-[#163B5C] text-white"
                }`}>
                  {selectedConversation.type === "direct" ? (
                    <span className="text-[14px] font-black">{displayConversationName(selectedConversation).slice(0, 2).toUpperCase()}</span>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                        <path d="M17 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                        <path d="M4.5 18a4.5 4.5 0 0 1 9 0" />
                        <path d="M14 18a3.5 3.5 0 0 1 6 0" />
                      </svg>
                      <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-[#22C55E] text-white shadow-sm">
                        +
                      </span>
                    </>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-[17px] font-black leading-tight text-[#061426]">{displayConversationName(selectedConversation)}</h2>
                  <p className="truncate text-[12px] font-semibold leading-tight text-[#64748B]">
                    {selectedConversationSubtitle}
                  </p>
                </div>
                {!selectedConversation.pendingSetup ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#E6EAF1] bg-white text-[#061426] shadow-[0_8px_18px_rgba(6,20,38,0.08)]"
                      onClick={() => setManageOpen((value) => !value)}
                      aria-label="More chat options"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
                        <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
                        <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
                      </svg>
                    </button>
                  </div>
                ) : null}
                </div>
              </div>

              {manageOpen && !selectedConversation.pendingSetup ? (
                <div className="absolute right-3 top-[74px] z-20 w-[min(310px,calc(100%-1.5rem))] rounded-[18px] border border-[#E2E8F0] bg-white p-3 shadow-[0_18px_48px_rgba(6,20,38,0.2)]">
                  <div className="space-y-2">
                    <button
                      type="button"
                      className="flex h-10 w-full items-center rounded-[12px] px-3 text-left text-[13px] font-black text-[#061426] active:bg-[#F8FAFC]"
                      onClick={() => void toggleConversationPin()}
                    >
                      {selectedConversation.pinned ? "Unpin chat" : "Pin chat"}
                    </button>
                    {selectedCanLeave ? (
                      <button
                        type="button"
                        className="flex h-10 w-full items-center rounded-[12px] px-3 text-left text-[13px] font-black text-[#061426] active:bg-[#F8FAFC]"
                        onClick={() => void leaveSelectedConversation()}
                      >
                        Leave group
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="flex h-10 w-full items-center rounded-[12px] px-3 text-left text-[13px] font-black text-[#061426] active:bg-[#F8FAFC]"
                      onClick={() => {
                        setShowArchivedLists((v) => !v);
                        setManageOpen(false);
                      }}
                    >
                      {showArchivedLists ? "Hide archived lists" : "Show archived lists"}
                    </button>
                    {selectedCanArchive ? (
                      <button
                        type="button"
                        className="flex h-10 w-full items-center rounded-[12px] px-3 text-left text-[13px] font-black text-[#DC2626] active:bg-[#FEF2F2]"
                        onClick={() => void archiveSelectedConversation()}
                      >
                        Archive chat
                      </button>
                    ) : null}
                  </div>
                  {isRealGroupConversation ? (
                    <div className="mt-2 border-t border-[#E2E8F0] pt-2">
                      <div className="flex items-center justify-between gap-2 px-3 pb-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#64748B]">
                          Members ({selectedConversationMembers.length})
                        </p>
                        <button
                          type="button"
                          className="h-8 rounded-full bg-[#061426] px-3 text-[11px] font-black text-white active:bg-[#0B1F33]"
                          onClick={() => {
                            setGroupAddIds([]);
                            setGroupAddOpen(true);
                          }}
                        >
                          + Add members
                        </button>
                      </div>
                      <div className="max-h-56 space-y-1 overflow-y-auto">
                        {selectedConversationMembers.map((member) => (
                          <div key={member.user_id} className="flex items-center justify-between gap-2 rounded-[12px] px-2 py-2">
                            <span className="min-w-0 text-[12px] font-bold text-[#061426]">
                              <span className="block truncate">{member.name || member.email || "User"}</span>
                              <span className="block truncate text-[10px] text-[#64748B]">{member.email || member.role || ""}</span>
                            </span>
                            {selectedCanManage && String(member.user_id) !== String(currentUserId) ? (
                              <button
                                type="button"
                                className="h-8 rounded-full bg-[#FEF2F2] px-3 text-[11px] font-black text-[#DC2626]"
                                onClick={() => void removeChatMember(member)}
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      {!selectedCanManage ? (
                        <p className="px-3 pt-1 text-[10px] font-semibold text-[#94A3B8]">
                          Anyone can add members. Only a manager can remove them.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selectedChatListResolved && chatPane === "list-detail" ? (
                renderChatListDetailView(selectedChatListResolved)
              ) : (
                <>
              {(chatLists.length > 0 || (showArchivedLists && archivedLists.length > 0)) && !selectedConversation.pendingSetup ? (
                <div className="opera-hide-scrollbar flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[#E6EAF1] bg-white px-3 py-2.5">
                  {chatLists.map((list) => renderChatListRibbonChip(list))}
                  {CHAT_SUBTASK_CATEGORIES.map((cat) => {
                    const items = chatSmartCategoryItems[cat.value] || [];
                    if (!items.length) return null;
                    const openCount = items.filter((it) => !it.is_done).length;
                    return (
                      <button
                        key={`smart-${cat.key}`}
                        type="button"
                        onClick={() => setSmartCategoryView(cat.value)}
                        title={`${cat.title} — auto list`}
                        className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#C7D8EE] bg-[#EEF4FC] px-2.5 py-1.5 text-[12px] font-black text-[#163B5C] active:bg-[#E1ECF9]"
                      >
                        <span aria-hidden="true">{cat.emoji}</span>
                        <span className="max-w-[110px] truncate">{cat.title}</span>
                        {openCount > 0 ? (
                          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-white px-1.5 text-[10px] font-black text-[#163B5C]">
                            {openCount}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                  {showArchivedLists
                    ? archivedLists.map((al) => (
                        <button
                          key={`arch-${al.id}`}
                          type="button"
                          className="flex shrink-0 items-center gap-1.5 rounded-full border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-2.5 py-1.5 text-[12px] font-black text-[#94A3B8] active:bg-[#EEF2F7]"
                          title="Archived — tap to unarchive"
                          onClick={() => {
                            if (window.confirm(`Unarchive "${al.title || "list"}"?`)) void unarchiveChatList(al.id);
                          }}
                        >
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" />
                          </svg>
                          <span className="max-w-[110px] truncate line-through">{al.title || "List"}</span>
                          <span className="text-[10px] font-black uppercase tracking-[0.06em] text-[#2563EB]">Unarchive</span>
                        </button>
                      ))
                    : null}
                  {showArchivedLists && archivedLists.length === 0 ? (
                    <span className="shrink-0 text-[11px] font-semibold text-[#94A3B8]">No archived lists</span>
                  ) : null}
                </div>
              ) : null}
              <div
                ref={chatThreadScrollRef}
                className="opera-hide-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3"
                    style={{
                      backgroundColor: "#EFF3F8",
                      backgroundImage:
                        "radial-gradient(rgba(6,20,38,0.035) 1px, transparent 1px), radial-gradient(rgba(6,20,38,0.015) 1px, transparent 1px)",
                      backgroundSize: "24px 24px",
                      backgroundPosition: "0 0, 12px 12px",
                    }}
                  >
                {selectedConversation.pendingSetup ? (
                  <EmptyState title="All employees" body="Company-wide chat will appear here once the chat service is connected." />
                ) : messagesLoading && !threadCacheHydrated ? (
                  <p className="pt-10 text-center text-[13px] font-semibold text-[#64748B]">Loading messages...</p>
                ) : (
                  <>
                    {chatTimelineGroups.length === 0 ? (
                      <EmptyState icon={chatEmptyStateIcon} title="No messages yet" body="Send the first update to this chat." className="mt-8" />
                    ) : (
                      <div className="space-y-4">
                        {chatTimelineGroups.map((group) => (
                          <div key={group.dayKey} className="space-y-3">
                            <div className="mx-auto flex w-fit rounded-full bg-white/92 px-3 py-1 text-[11px] font-bold text-[#5B6576] shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
                              {group.label}
                            </div>
                            <div className="space-y-2.5">
                              {group.rows.map((entry, entryIndex) => {
                                const previousSenderId = entryIndex > 0 ? group.rows[entryIndex - 1]?.row?.sender_user_id : null;
                                const showSenderName = String(entry?.row?.sender_user_id ?? "") !== String(previousSenderId ?? "");
                                return renderChatMessageRow(entry.row, showSenderName);
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="shrink-0 border-t border-[#E6EAF1] bg-white/96 px-2.5 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] backdrop-blur">
                <input
                  ref={chatImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => void handleChatImagePick(event)}
                />
                {chatReplyTarget ? (
                  <div className="mb-2 rounded-[18px] border border-[#E2E8F0] bg-white px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#9A6B12]">
                          Replying to {chatReplyTarget.sender_name || "message"}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[12px] font-semibold text-[#475569]">
                          {String(chatReplyTarget.body || "").trim() || "Attachment"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-[16px] font-black text-[#061426]"
                        onClick={() => setChatReplyTarget(null)}
                        aria-label="Cancel reply"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M6 6 18 18" />
                          <path d="M18 6 6 18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ) : null}
                <div className="relative flex items-center gap-1.5">
                  {chatUtilityMenuOpen ? (
                    <button
                      type="button"
                      className="fixed inset-0 z-10 cursor-default"
                      aria-label="Close menu"
                      onClick={() => setChatUtilityMenuOpen(false)}
                    />
                  ) : null}
                  {chatUtilityMenuOpen ? (
                    <div
                      className="absolute bottom-[calc(100%+8px)] left-0 z-20 w-44 overflow-hidden rounded-[16px] border border-[#E6EAF1] bg-white shadow-[0_18px_44px_rgba(6,20,38,0.16)]"
                      role="menu"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="flex h-11 w-full items-center gap-3 px-3.5 text-left text-[13px] font-bold text-[#061426] active:bg-[#F8FAFC]"
                        disabled={selectedConversation.pendingSetup || chatUploading}
                        onClick={() => {
                          setChatUtilityMenuOpen(false);
                          chatImageInputRef.current?.click();
                        }}
                      >
                        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M4 7a2 2 0 0 1 2-2h2l1.5-2h5L16 5h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
                          <circle cx="12" cy="12" r="3.2" />
                        </svg>
                        {chatUploading ? "Uploading..." : "Camera"}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex h-11 w-full items-center gap-3 border-t border-[#F1F5F9] px-3.5 text-left text-[13px] font-bold text-[#061426] active:bg-[#F8FAFC]"
                        disabled={selectedConversation.pendingSetup}
                        onClick={() => {
                          setChatUtilityMenuOpen(false);
                          setListComposerOpen(true);
                        }}
                      >
                        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M8 6h13M8 12h13M8 18h13" />
                          <path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2" />
                        </svg>
                        List
                      </button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#E6EAF1] bg-white text-[#061426] shadow-[0_6px_16px_rgba(6,20,38,0.08)] disabled:text-[#94A3B8]"
                    disabled={selectedConversation.pendingSetup}
                    onClick={() => setChatUtilityMenuOpen((value) => !value)}
                    aria-label="Attach"
                    aria-expanded={chatUtilityMenuOpen}
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                  <div className="flex min-h-11 flex-1 items-center rounded-[24px] border border-[#E6EAF1] bg-white px-4 py-2 shadow-[0_6px_16px_rgba(6,20,38,0.06)]">
                    <textarea
                      ref={chatMessageInputRef}
                      rows={1}
                      className="chat-mobile-safe-input max-h-28 min-h-[20px] w-full resize-none self-center bg-transparent text-[16px] font-medium leading-[20px] text-[#061426] outline-none placeholder:text-[#94A3B8]"
                      value={messageDraft}
                      maxLength={2000}
                      placeholder={selectedConversation.pendingSetup ? "Company chat is loading" : "Message"}
                      disabled={selectedConversation.pendingSetup}
                      onChange={(event) => setMessageDraft(event.target.value)}
                      onFocus={() => {
                        // When the keyboard opens, keep the newest message pinned
                        // just above the composer. Retry across the keyboard's
                        // open animation since the viewport resizes late on iOS.
                        requestAnimationFrame(() => scrollChatThreadToBottom("auto"));
                        [120, 280, 520].forEach((delay) =>
                          window.setTimeout(() => scrollChatThreadToBottom("auto"), delay)
                        );
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent?.isComposing) {
                          event.preventDefault();
                          void sendChatMessage();
                        }
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#061426] text-white shadow-[0_10px_22px_rgba(6,20,38,0.24)] active:bg-[#0B1F33] disabled:bg-[#CBD5E1]"
                    disabled={selectedConversation.pendingSetup || !hasDraftMessage}
                    // Prevent the tap from blurring the message box: on mobile,
                    // losing focus dismisses the keyboard. Keeping focus here
                    // lets the user keep typing after sending; the keyboard
                    // only closes when they dismiss it (tap outside / done).
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => void sendChatMessage()}
                    aria-label="Send message"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m22 2-7 20-4-9-9-4Z" />
                      <path d="M22 2 11 13" />
                    </svg>
                  </button>
                </div>
                {chatUploading ? <p className="mt-1 px-3 text-[11px] font-bold text-[#64748B]">Uploading photo...</p> : null}
              </div>
                </>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-4">
              <EmptyState icon={chatEmptyStateIcon} title="Select a chat" body="Choose a conversation from the list." />
            </div>
          )}
        </section>

      {chatActiveMessage ? (
        <div
          className="fixed inset-0 z-[94] flex items-end justify-center bg-[#0B1F33]/55 px-3 pb-3 pt-10"
          role="dialog"
          aria-modal="true"
          onClick={clearChatMessageActions}
        >
          <div className="w-full max-w-sm space-y-3" onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-white px-3 py-2 shadow-[0_24px_70px_rgba(6,20,38,0.18)]">
              {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((reaction) => (
                <button
                  key={reaction}
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-[22px] transition active:bg-[#F8FAFC]"
                  onClick={() => {
                    setError("Reactions are coming soon in development.");
                    clearChatMessageActions();
                  }}
                  aria-label={`React ${reaction}`}
                >
                  {reaction}
                </button>
              ))}
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F8FAFC] text-[24px] font-medium text-[#061426]"
                onClick={() => setError("More reactions are coming soon in development.")}
                aria-label="More reactions"
              >
                +
              </button>
            </div>
            <div className="overflow-hidden rounded-[26px] border border-[#E2E8F0] bg-white shadow-[0_24px_70px_rgba(6,20,38,0.28)]">
              <div className="border-b border-[#EEF2F7] px-4 py-3">
                <div className="min-w-0">
                  <h3 className="truncate text-[18px] font-black text-[#061426]">
                    {String(chatActiveMessage.sender_name || "Message").trim()}
                  </h3>
                  <p className="mt-0.5 line-clamp-2 text-[12px] font-semibold text-[#64748B]">
                    {String(chatActiveMessage.body || "").trim() || "Attachment"}
                  </p>
                </div>
              </div>
              <div className="py-1">
                <button type="button" className="flex h-12 w-full items-center gap-3 px-4 text-left text-[16px] font-semibold text-[#061426] active:bg-[#F8FAFC]" onClick={() => startChatReply(chatActiveMessage)}>
                  <span className="flex h-8 w-8 items-center justify-center text-[#061426]">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m10 9-5 5 5 5" />
                      <path d="M20 4v7a4 4 0 0 1-4 4H5" />
                    </svg>
                  </span>
                  Reply
                </button>
                <button type="button" className="flex h-12 w-full items-center gap-3 px-4 text-left text-[16px] font-semibold text-[#061426] active:bg-[#F8FAFC]" onClick={() => openChatForwardTarget(chatActiveMessage)}>
                  <span className="flex h-8 w-8 items-center justify-center text-[#061426]">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m14 6 6 6-6 6" />
                      <path d="M20 12H8a4 4 0 0 0-4 4v2" />
                    </svg>
                  </span>
                  Forward
                </button>
                <button type="button" className="flex h-12 w-full items-center gap-3 px-4 text-left text-[16px] font-semibold text-[#061426] active:bg-[#F8FAFC]" onClick={() => void copyChatMessageText(chatActiveMessage)}>
                  <span className="flex h-8 w-8 items-center justify-center text-[#061426]">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="9" width="10" height="10" rx="2" />
                      <path d="M5 15V7a2 2 0 0 1 2-2h8" />
                    </svg>
                  </span>
                  Copy
                </button>
                <button type="button" className="flex h-12 w-full items-center gap-3 px-4 text-left text-[16px] font-semibold text-[#061426] active:bg-[#F8FAFC]" onClick={() => void toggleMessagePin(chatActiveMessage)}>
                  <span className="flex h-8 w-8 items-center justify-center text-[#061426]">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m12 17 4 4v-7l4-4V5H9l-5 5h7v11Z" />
                    </svg>
                  </span>
                  {chatActiveMessage.pinned ? "Unstar" : "Star"}
                </button>
                {Array.isArray(chatActiveMessage.attachments) && chatActiveMessage.attachments.length ? (
                  <button type="button" className="flex h-12 w-full items-center gap-3 px-4 text-left text-[16px] font-semibold text-[#061426] active:bg-[#F8FAFC]" onClick={() => void saveChatMessageMedia(chatActiveMessage)}>
                    <span className="flex h-8 w-8 items-center justify-center text-[#061426]">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 4v10" />
                        <path d="M7.5 10.5 12 15l4.5-4.5" />
                        <path d="M5 20h14" />
                      </svg>
                    </span>
                    Save media
                  </button>
                ) : null}
                {chatActiveMessage.can_delete ? (
                  <button type="button" className="flex h-12 w-full items-center gap-3 px-4 text-left text-[16px] font-semibold text-[#DC2626] active:bg-[#FEF2F2]" onClick={() => void deleteChatMessage(chatActiveMessage)}>
                    <span className="flex h-8 w-8 items-center justify-center text-[#DC2626]">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M7 6l1 13h8l1-13" />
                        <path d="M10 10v6M14 10v6" />
                      </svg>
                    </span>
                    Delete
                  </button>
                ) : null}
                <div className="mx-4 my-1 h-px bg-[#EEF2F7]" />
                <button type="button" className="flex h-12 w-full items-center gap-3 px-4 text-left text-[16px] font-semibold text-[#061426] active:bg-[#F8FAFC]" onClick={clearChatMessageActions}>
                  <span className="flex h-8 w-8 items-center justify-center text-[#061426]">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="1" />
                      <circle cx="19" cy="12" r="1" />
                      <circle cx="5" cy="12" r="1" />
                    </svg>
                  </span>
                  More...
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {chatForwardMessage ? (
        <div
          className="fixed inset-0 z-[95] flex items-end justify-center bg-[#0B1F33]/55 px-3 pb-3 pt-10"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setChatForwardMessage(null);
            setChatForwardSearch("");
          }}
        >
          <div
            className="w-full max-w-sm rounded-t-[28px] rounded-b-[22px] border border-[#E2E8F0] bg-white p-4 shadow-[0_24px_70px_rgba(6,20,38,0.28)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#163B5C]">Forward</p>
                <h3 className="mt-1 text-[22px] font-black text-[#061426]">Choose chat</h3>
              </div>
              <button
                type="button"
                className="h-9 w-9 rounded-full border border-[#E2E8F0] bg-white text-[18px] font-black text-[#061426]"
                onClick={() => {
                  setChatForwardMessage(null);
                  setChatForwardSearch("");
                }}
                aria-label="Close forward dialog"
              >
                x
              </button>
            </div>
            <label className="mt-4 flex h-11 items-center gap-2 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-3">
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[#64748B]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                ref={chatForwardSearchRef}
                value={chatForwardSearch}
                onChange={(event) => setChatForwardSearch(event.target.value)}
                className="h-full min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[#061426] outline-none placeholder:text-[#94A3B8]"
                placeholder="Search chats"
              />
            </label>
            <div className="mt-3 max-h-[42dvh] space-y-2 overflow-y-auto">
              {visibleConversationRows
                .filter((conversation) => String(conversation.id) !== String(selectedConversationId))
                .filter((conversation) => {
                  const query = chatForwardSearch.trim().toLowerCase();
                  if (!query) return true;
                  const name = displayConversationName(conversation).toLowerCase();
                  const preview = String(conversation.last_message || "").toLowerCase();
                  return name.includes(query) || preview.includes(query);
                })
                .map((conversation) => {
                  const name = displayConversationName(conversation);
                  const preview = conversation.last_message || (conversation.type === "company" ? "Company-wide chat" : "No messages yet");
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-[16px] border border-[#E2E8F0] bg-white px-3 py-3 text-left active:bg-[#F8FAFC]"
                      onClick={() => void sendForwardedChatMessage(conversation.id)}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#061426] text-[12px] font-black text-white">
                        {name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-black text-[#061426]">{name}</span>
                        <span className="block truncate text-[12px] font-semibold text-[#64748B]">{preview}</span>
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      ) : null}

      {chatImageViewer ? (
        <div className="fixed inset-0 z-[96] flex flex-col bg-[#061426] text-white" role="dialog" aria-modal="true">
          <div className="flex items-center gap-3 border-b border-white/10 px-3 py-3">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
              onClick={() => setChatImageViewer(null)}
              aria-label="Close image viewer"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-black uppercase tracking-[0.12em] text-white/70">
                {chatImageViewer?.message?.sender_name || "Photo"}
              </p>
              <p className="truncate text-[14px] font-bold text-white/90">
                {String(chatImageViewer?.attachment?.file_name || "Attachment").trim()}
              </p>
            </div>
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
              onClick={() => window.open(chatImageViewer?.attachment?.public_url || "", "_blank", "noopener,noreferrer")}
              aria-label="Open image in new tab"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 17 17 7" />
                <path d="M9 7h8v8" />
              </svg>
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center p-4">
            {chatImageViewer?.attachment?.public_url ? (
              <img
                src={chatImageViewer.attachment.public_url}
                alt={chatImageViewer?.attachment?.file_name || "Chat attachment"}
                className="max-h-[80dvh] max-w-full rounded-[22px] object-contain shadow-[0_18px_60px_rgba(0,0,0,0.35)]"
              />
            ) : (
              <EmptyState title="No image" body="The selected image could not be opened." />
            )}
          </div>
        </div>
      ) : null}

      {smartCategoryView ? (() => {
        const meta = CHAT_SUBTASK_CATEGORIES.find((c) => c.value === smartCategoryView) || null;
        const items = chatSmartCategoryItems[smartCategoryView] || [];
        const openItems = items.filter((it) => !it.is_done);
        const doneItems = items.filter((it) => it.is_done);
        const ordered = [...openItems, ...doneItems];
        return (
          <div className="fixed inset-0 z-[93] flex flex-col bg-white" role="dialog" aria-modal="true">
            <div className="flex items-center gap-3 border-b border-[#E2E8F0] bg-white px-3 py-3">
              <button
                type="button"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#E2E8F0] bg-[#F8FAFC] text-[#061426]"
                onClick={() => setSmartCategoryView(null)}
                aria-label="Close smart list"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEF4FC] text-[18px]" aria-hidden="true">
                {meta?.emoji || "📋"}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[17px] font-black text-[#061426]">{meta?.title || "Smart list"}</h2>
                <p className="truncate text-[11px] font-semibold text-[#64748B]">
                  Auto list · {openItems.length} open / {items.length} total
                </p>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto bg-[#F6F8FB] px-3 py-3 space-y-2">
              {ordered.length === 0 ? (
                <p className="pt-10 text-center text-[13px] font-semibold text-[#64748B]">
                  {smartCategoryView === "Other"
                    ? "No untagged subtasks. Items you don't tag H or T show up here."
                    : `No ${meta?.title || ""} items yet. Tag a subtask with “${meta?.short || ""}” to add it here.`}
                </p>
              ) : (
                ordered.map((it) => (
                  <div
                    key={`smart-item-${it.id}`}
                    className={`flex items-start gap-2.5 rounded-[14px] border px-3 py-2.5 ${
                      it.is_done ? "border-[#DDE7DD] bg-white" : "border-[#E2E8F0] bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={Boolean(it.is_done)}
                      onClick={() => void toggleChatListItemAnywhere(it)}
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-white transition ${
                        it.is_done ? "border-[#15803D] bg-[#15803D]" : "border-[#C4D2E3] bg-white"
                      }`}
                      aria-label={`${it.is_done ? "Mark open" : "Mark complete"}: ${it.text}`}
                    >
                      {it.is_done ? (
                        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="m3.2 8.3 3 3 6.5-6.6" />
                        </svg>
                      ) : null}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[14px] font-semibold text-[#061426] ${it.is_done ? "line-through opacity-60" : ""}`}>
                        {normalizeChatListItemDraftText(it.text)}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] font-semibold text-[#94A3B8]">
                        from {it.__listTitle}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })() : null}

      {listComposerOpen && selectedConversation && !selectedConversation.pendingSetup ? (
        <div className="fixed inset-0 z-[92] flex items-end justify-center bg-[#0B1F33]/55 px-2 pb-2 pt-10" role="dialog" aria-modal="true">
          <div className="max-h-[88dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[24px] rounded-b-[18px] border border-[#E2E8F0] bg-white p-3.5 shadow-[0_24px_70px_rgba(6,20,38,0.28)]">
            <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-[#CBD5E1]" aria-hidden="true" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#163B5C]">Chat list</p>
                <h3 className="mt-0.5 text-[20px] font-black text-[#061426]">Create list</h3>
              </div>
              <button
                type="button"
                className="h-9 w-9 rounded-full border border-[#E2E8F0] bg-white text-[18px] font-black text-[#061426]"
                onClick={() => setListComposerOpen(false)}
                aria-label="Close list composer"
              >
                x
              </button>
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#475569]">List type</p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: "home_depot", label: "Home Depot" },
                  { id: "pending_job", label: "Pending job" },
                  { id: "other", label: "Other" },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`h-11 rounded-[12px] border px-1 text-[12px] font-black transition ${
                      listType === option.id
                        ? "border-[#061426] bg-[#061426] text-white"
                        : "border-[#CBD5E1] bg-white text-[#061426]"
                    }`}
                    onClick={() => setListType(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {listType === "home_depot" ? (
              <label className="mt-3 block space-y-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#475569]">
                Home Depot store
                {hdStoresLoading || hdStoreSuggestLoading ? (
                  <span className="block text-[11px] font-semibold normal-case tracking-normal text-[#94A3B8]">Finding stores…</span>
                ) : null}
                {(() => {
                  const q = listStoreName.trim().toLowerCase();
                  const matches = hdStoreOptions.filter(
                    (store) =>
                      !q ||
                      String(store.name || "").toLowerCase().includes(q) ||
                      String(store.address || "").toLowerCase().includes(q)
                  );
                  const exact = matches.length === 1 && matches[0].name.trim().toLowerCase() === q;
                  if (!matches.length || exact) return null;
                  return (
                    <span className="flex flex-wrap gap-1.5">
                      {matches.slice(0, 8).map((store) => {
                        const selected = q === store.name.trim().toLowerCase();
                        return (
                          <button
                            key={`hdstore-${store.name}`}
                            type="button"
                            title={store.address || store.name}
                            className={`rounded-full border px-2.5 py-1 text-[12px] font-black normal-case tracking-normal ${
                              selected ? "border-[#061426] bg-[#061426] text-white" : "border-[#CBD5E1] bg-white text-[#061426]"
                            }`}
                            onClick={() => setListStoreName(store.name)}
                          >
                            {store.name}
                          </button>
                        );
                      })}
                    </span>
                  );
                })()}
                <input
                  inputMode="text"
                  autoComplete="off"
                  className="chat-mobile-safe-input mt-1 h-11 w-full rounded-[14px] border border-[#CBD5E1] bg-white px-3 text-[16px] font-medium normal-case tracking-normal text-[#061426] outline-none focus:border-[#163B5C]"
                  style={{ fontSize: 16 }}
                  value={listStoreName}
                  maxLength={80}
                  onChange={(event) => setListStoreName(event.target.value)}
                  placeholder={hdStoreOptions.length ? "Pick above or type a store" : "e.g. Nepean, Barrhaven"}
                />
              </label>
            ) : null}
            {listType === "home_depot" ? (
              <p className="mt-3 rounded-[12px] bg-[#F1F5F9] px-3 py-2 text-[12px] font-semibold text-[#64748B]">
                Named automatically — “Home Depot {(Array.isArray(chatLists) ? chatLists : []).filter((l) => String(l?.list_type || "") === "home_depot").length + 1}”.
              </p>
            ) : (
              <label className="mt-3 block space-y-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#475569]">
                Title
                <input
                  ref={chatListTitleInputRef}
                  inputMode="text"
                  autoComplete="off"
                  enterKeyHint="next"
                  className="chat-mobile-safe-input h-11 w-full rounded-[14px] border border-[#CBD5E1] bg-white px-3 text-[16px] font-medium normal-case tracking-normal text-[#061426] outline-none focus:border-[#163B5C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#163B5C]/15"
                  style={{ fontSize: 16 }}
                  value={listTitle}
                  maxLength={120}
                  onChange={(event) => setListTitle(event.target.value)}
                  placeholder="List name"
                />
              </label>
            )}
            <label className="mt-3 block space-y-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#475569]">
              Items
              <textarea
                className="chat-mobile-safe-input min-h-[108px] w-full resize-none rounded-[14px] border border-[#CBD5E1] bg-white px-3 py-2.5 text-[16px] font-medium normal-case tracking-normal text-[#061426] outline-none focus:border-[#163B5C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#163B5C]/15"
                style={{ fontSize: 16 }}
                value={listItemsText}
                onChange={(event) => setListItemsText(event.target.value)}
                placeholder={"One main item per line\n  Indent sub-items with spaces"}
              />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="h-12 rounded-[14px] border border-[#CBD5E1] bg-white text-[15px] font-black text-[#061426]"
                onClick={() => setListComposerOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-12 rounded-[14px] bg-[#061426] text-[15px] font-black text-white disabled:bg-[#CBD5E1]"
                disabled={listBusy || (listType !== "home_depot" && !listTitle.trim())}
                onClick={() => void createChatList()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {composerOpen ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-[#0B1F33]/55 px-3 pb-3 pt-10" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-t-[28px] rounded-b-[22px] border border-[#E2E8F0] bg-white p-4 shadow-[0_24px_70px_rgba(6,20,38,0.28)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#163B5C]">Chat</p>
                <h3 className="mt-1 text-[22px] font-black text-[#061426]">
                  {composerOpen === "direct" ? "New chat" : "New group"}
                </h3>
              </div>
              <button
                type="button"
                className="h-9 w-9 rounded-full border border-[#E2E8F0] bg-white text-[18px] font-black text-[#061426]"
                onClick={() => setComposerOpen(null)}
                aria-label="Close chat composer"
              >
                x
              </button>
            </div>

            {composerOpen === "group" ? (
              <label className="mt-4 block space-y-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#475569]">
                Group name
                <input
                  className="h-12 w-full rounded-[14px] border border-[#CBD5E1] bg-white px-3 text-[15px] font-semibold normal-case tracking-normal text-[#061426] outline-none focus:border-[#061426]"
                  value={groupName}
                  maxLength={80}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Crew chat"
                />
              </label>
            ) : null}

            {composerOpen === "direct" ? (
              <button
                type="button"
                className="mt-4 flex w-full items-center gap-3 rounded-[16px] border border-[#061426] bg-[#061426] px-3 py-2.5 text-left text-white"
                onClick={() => {
                  setGroupName("");
                  setGroupMemberIds([]);
                  setComposerOpen("group");
                }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-white/15 text-white">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-black">Create group</span>
                  <span className="block text-[12px] font-semibold text-white/70">Name it, then pick people</span>
                </span>
                <span className="text-[18px] font-black text-white/80">&rsaquo;</span>
              </button>
            ) : null}

            <div className="mt-4 max-h-[45dvh] space-y-2 overflow-y-auto">
              {composerOpen === "direct" ? (
                <p className="px-1 pb-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#64748B]">Start a direct chat</p>
              ) : null}
              {availableMembers.length === 0 ? (
                <EmptyState title="No team members" body="Add employees before starting a chat." />
              ) : (
                availableMembers.map((member) => {
                  const selected = groupMemberIds.includes(member.user_id);
                  return (
                    <button
                      key={member.user_id}
                      type="button"
                      className={`flex w-full items-center gap-3 rounded-[16px] border px-3 py-2.5 text-left ${
                        selected ? "border-[#061426] bg-[#F8FAFC]" : "border-[#E2E8F0] bg-white"
                      }`}
                      onClick={() =>
                        composerOpen === "direct" ? void createDirectChat(member.user_id) : toggleGroupMember(member.user_id)
                      }
                      disabled={creatingChat}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-[#061426] text-[12px] font-black text-white">
                        {member.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-black text-[#061426]">{member.name}</span>
                        <span className="block truncate text-[12px] font-semibold text-[#64748B]">{member.email || member.role}</span>
                      </span>
                      {composerOpen === "group" ? (
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-black ${
                            selected ? "border-[#061426] bg-[#061426] text-white" : "border-[#CBD5E1] bg-white text-[#CBD5E1]"
                          }`}
                        >
                          {selected ? "OK" : ""}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>

            {composerOpen === "group" ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="h-12 rounded-[14px] border border-[#CBD5E1] bg-white text-[15px] font-black text-[#061426]"
                  onClick={() => setComposerOpen(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="h-12 rounded-[14px] bg-[#061426] text-[15px] font-black text-white disabled:bg-[#CBD5E1]"
                  disabled={!groupName.trim() || groupMemberIds.length === 0}
                  onClick={() => void createGroupChat()}
                >
                  {creatingChat ? "Creating..." : "Create"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {groupAddOpen ? (
        <div className="fixed inset-0 z-[91] flex items-end justify-center bg-[#0B1F33]/55 px-3 pb-3 pt-10" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-t-[28px] rounded-b-[22px] border border-[#E2E8F0] bg-white p-4 shadow-[0_24px_70px_rgba(6,20,38,0.28)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#163B5C]">Group</p>
                <h3 className="mt-1 text-[22px] font-black text-[#061426]">Add members</h3>
              </div>
              <button
                type="button"
                className="h-9 w-9 rounded-full border border-[#E2E8F0] bg-white text-[18px] font-black text-[#061426]"
                onClick={() => {
                  setGroupAddOpen(false);
                  setGroupAddIds([]);
                }}
                aria-label="Close add members"
              >
                x
              </button>
            </div>
            <div className="mt-4 max-h-[45dvh] space-y-2 overflow-y-auto">
              {addableGroupMembers.length === 0 ? (
                <EmptyState title="Everyone's in" body="All active team members are already in this group." />
              ) : (
                addableGroupMembers.map((member) => {
                  const selected = groupAddIds.includes(member.user_id);
                  return (
                    <button
                      key={member.user_id}
                      type="button"
                      className={`flex w-full items-center gap-3 rounded-[16px] border px-3 py-2.5 text-left ${
                        selected ? "border-[#061426] bg-[#F8FAFC]" : "border-[#E2E8F0] bg-white"
                      }`}
                      onClick={() =>
                        setGroupAddIds((prev) =>
                          prev.includes(member.user_id) ? prev.filter((id) => id !== member.user_id) : [...prev, member.user_id]
                        )
                      }
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] bg-[#061426] text-[12px] font-black text-white">
                        {member.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-black text-[#061426]">{member.name}</span>
                        <span className="block truncate text-[12px] font-semibold text-[#64748B]">{member.email || member.role}</span>
                      </span>
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-black ${
                          selected ? "border-[#061426] bg-[#061426] text-white" : "border-[#CBD5E1] bg-white text-[#CBD5E1]"
                        }`}
                      >
                        {selected ? "OK" : ""}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                className="h-12 rounded-[14px] border border-[#CBD5E1] bg-white text-[15px] font-black text-[#061426]"
                onClick={() => {
                  setGroupAddOpen(false);
                  setGroupAddIds([]);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="h-12 rounded-[14px] bg-[#061426] text-[15px] font-black text-white disabled:bg-[#CBD5E1]"
                disabled={groupAddIds.length === 0 || creatingChat}
                onClick={() => void addChatMembers()}
              >
                {creatingChat ? "Adding..." : `Add${groupAddIds.length ? ` (${groupAddIds.length})` : ""}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </PageCard>
  );
}
