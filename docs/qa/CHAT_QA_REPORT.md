# OPERA.AI Chat QA Report

Date: 2026-07-05
Branch: develop
Environment: development only
Development URL: https://project-rui1d-development.vercel.app

## Scope

This pass focused on the Chat timeline ordering fix, pinned-list shortcut behavior, local-first chat cache, checklist UX regression coverage, and development-only end-to-end QA evidence collection. No production deployment, production SQL, or production database changes were performed.

## Chat Fixes Covered In This QA Pass

- Combined message rows and checklist cards now render in one chronological chat timeline.
- Timeline merge order is ascending by `created_at`, so the newest messages land at the bottom.
- Pinned checklist cards remain inside the normal thread; the pinned ribbon is a shortcut only.
- Conversation-open behavior now hydrates cached thread state first, then refreshes quietly in the background.
- Optimistic message send dedupes against server rows using `client_id` before server `id`.
- Checklist item optimistic merges now dedupe by stable semantic key so local/server sync does not duplicate rows.
- Add-item focus retention was tightened so the list entry field stays usable for rapid entry.
- Legacy checklist text with baked-in numbering is normalized on render/edit/save so visible numbering stays clean.

## Screenshot Evidence

- `docs/qa/chat/12-chat-list-headless.png` - mobile chat list with search, All/Pinned filters, and pinned conversation marker.
- `docs/qa/chat/05-search-filter.png` - search and filter state.
- `docs/qa/chat/07-new-group-modal.png` - New group modal with member pickers.
- `docs/qa/chat/08-group-created-thread.png` - group thread opened after creation.
- `docs/qa/chat/21-dedupe-check-message.png` - list card remains in timeline while the newest sent message appears below it.
- `docs/qa/chat/16-list-card-in-thread.png` - pinned shortcut visible at top while the original list card remains in the thread.
- `docs/qa/chat/22-list-detail-current.png` - current list-detail screen with stable numbering and icon-only delete affordance.
- `docs/qa/chat/23-add-item-focus.png` - add-item field remains active/usable after rapid entry.
- `docs/qa/chat/10-reloaded-chat-list.png` - chat list after reload for local-cache reopen evidence.
- `docs/qa/chat/20-reloaded-qa-cache-thread.png` - cached thread reopen without blocking loading takeover.
- `docs/qa/chat/03-chat-thread-composer.png` - composer/mobile keyboard layout reference.

## QA Results

| Area | Status | Notes |
| --- | --- | --- |
| Chat list opens on mobile | pass | Chat list renders with search, All/Pinned, pinned markers, avatars, preview text, and bottom nav. |
| Search works | pass | Search-filter evidence captured in screenshot set; no regression seen in current dev state. |
| All/Pinned filters work | pass | Both filter states are present and were exercised in the screenshot pass. |
| New chat button | pass | Existing direct-chat flow preserved; broader final QA evidence confirms creation path remains available. |
| New group button/modal | pass | Group modal and created-thread screenshots captured. |
| Group opens thread | pass | Created group thread captured and list/message flow remained functional. |
| Thread header / back behavior | pass | Compact header, back arrow, pinned ribbon, and thread shell remain functional. |
| Timeline ordering | pass | Combined timeline keeps older list cards above newer sent messages; newest messages append at bottom. |
| Pinned ribbon behavior | pass | Ribbon is shortcut only; original pinned list card remains in the thread. |
| Pinned shortcut jump target | pass | Current thread/list-detail flow preserves selected list and returns to the original chat list card. |
| Composer send behavior | pass | Optimistic send shows immediately and the composer remains usable. |
| Local cache reopen | pass | Cached thread/list evidence exists; current implementation hydrates local cache before background refresh. |
| Blocking loading over cached thread | pass | Current code only shows blocking loading when there is no cached thread state. |
| List create modal | pass | Create list modal renders with placeholder-only fields and 16px inputs. |
| Title input mobile zoom | pass | Current list title/item inputs use `text-[16px]`, which avoids mobile zoom behavior. |
| Add item instant behavior | pass | QA detail view shows optimistic item append and focus restore. |
| Keyboard stays usable after add | pass | Focus restore logic now explicitly refocuses the input after optimistic and synced updates. |
| Mark done instant behavior | pass | Existing optimistic checklist toggle remains in place; completed rows update immediately in UI. |
| Completed items hidden by default | pass | List detail defaults to active/open rows only. |
| Eye icon shows/hides completed | pass | Current list detail header includes the completed-items toggle button. |
| Stable numbering | pass | Current list-detail evidence shows original numbering preserved without renumbering active rows. |
| Tap item text to edit | pass | Edit mode is triggered from the item text/button itself; no separate visible Edit row remains. |
| Visible delete/edit row on each item | pass | Old text-row edit/delete treatment is gone; delete is icon-only and edit is inline-by-tap. |
| Picture attachment UI | partial | Existing attachment UI and image bubble rendering remain in place; no fresh live image upload was executed in this pass. |
| Own message delete | pass | Prior live dev QA in `docs/qa/PAYROLL_CHAT_CLOCK_FINAL_QA_REPORT.md` verified delete confirmation and `Message deleted` state. |
| Admin delete/archive | partial | Admin moderation paths exist and remain wired; a fresh destructive browser pass is still worth re-running when browser confirmation flow is stable. |
| Leave group | partial | Leave-group path exists and was covered in earlier QA planning, but this specific pass did not capture a fresh leave screenshot. |
| Admin remove user | partial | Remove-member path exists and permissions were code-reviewed; a fresh browser evidence pass is still desirable. |
| Removed/left user blocked | partial | Permission/path logic remains in place; current pass relied on earlier role/RLS evidence rather than a new browser walkthrough. |

## Permission / RLS Review

Source of evidence:

- current `api/chat.js` permission flow
- prior broader QA evidence in `docs/qa/PAYROLL_CHAT_CLOCK_FINAL_QA_REPORT.md`

Current dev review confirms:

- employees must be active conversation members to list or read a thread
- employees can delete only their own messages
- admin/owner/supervisor moderation paths remain scoped to elevated roles
- group leave/remove operations mark membership with `left_at`
- archived/default/company-wide chat rules remain protected at API level

This is sufficient for development QA confidence, but the admin destructive flows still benefit from one fresh browser-driven moderation pass before any future production-gate claim that is chat-specific.

## Known Limits In This Pass

- Browser confirmation dialogs were unstable during one destructive-flow retry, so fresh screenshot evidence for admin archive/remove/leave was not fully regenerated in this pass.
- Picture attachment flow was preserved and still renders in the UI, but no new live upload was performed during this pass.

## Advisor Status

Advisor review was attempted multiple times after the report refresh, including a minimal sanity-check payload, but the `chatgpt-advisor` MCP transport closed before returning any verdict. No advisor verdict was produced in this pass.

## Production Readiness From Chat QA Side

Development-ready. Production readiness from the chat QA side still depends on a successful Advisor review plus one refreshed destructive-flow screenshot pass for admin archive/remove/leave if a controller wants a chat-only production gate with fresh evidence. Based on current evidence, the remaining risk is concentrated in advisor-tool availability and fresh destructive-flow screenshots, not the main timeline/cache/list behavior.
