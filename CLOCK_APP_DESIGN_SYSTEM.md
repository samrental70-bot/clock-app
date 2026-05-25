# Royal Navy FieldOps UI Design System

This document is the UI source of truth for the Clock App.

All future UI work must use the Royal Navy FieldOps UI tokens. No new hard-coded colors should be added unless approved by controller/design review.

Before completing any future UI task, Codex must check whether new styles match this design document.

## 1. Brand Direction

Royal Navy FieldOps UI is a premium contractor SaaS interface for mobile field operations.

The style should feel clean, serious, trustworthy, mobile-first, and business-ready. It can be inspired by the quality bar of Jobber, Buildertrend, and ServiceTitan, but it must keep its own Royal Navy identity.

Avoid pure black, toy-like pastel cards, heavy glowing shadows, random button colors, too many filled buttons, emoji icons, and prototype-looking UI.

## 2. Color Palette

Primary brand colors:

- Royal Navy 950: `#061426`
- Royal Navy 900: `#0B1F33`
- Royal Navy 800: `#102A43`
- Royal Navy 700: `#163B5C`
- Luxury Gold: `#C9A227`
- Background: `#F4F7FB`
- Surface: `#FFFFFF`
- Surface Soft: `#F8FAFC`
- Border: `#E2E8F0`
- Divider: `#CBD5E1`

Text colors:

- Text Primary: `#061426`
- Text Secondary: `#475569`
- Text Muted: `#64748B`
- Text Disabled: `#94A3B8`
- White: `#FFFFFF`

Status colors:

- Success Green: `#15803D`
- Success Soft: `#ECFDF5`
- Success Border: `#BBF7D0`
- Warning Amber: `#D97706`
- Warning Soft: `#FFF7E6`
- Danger Red: `#DC2626`
- Danger Soft: `#FEF2F2`
- Info Blue: `#2563EB`
- Info Soft: `#EFF6FF`
- Photos Purple: `#7C3AED`
- Photos Soft: `#F3E8FF`
- Receipts Amber: `#F59E0B`
- Receipts Soft: `#FFF7E6`

Color rules:

- Do not use pure black or near-black values such as `#000000`, `#010101`, `#020617`, or `#030712` as the main app color.
- Use `#061426` or `#0B1F33` for primary dark surfaces and actions.
- Use Luxury Gold only as a small premium accent, selected indicator, or accent line.
- Use green for live, active, success, working, receipt confirmation, and clocked-in status.
- Use red only for delete, danger, failed, or error states.
- Use blue for schedule, information, and links.
- Use purple for photos and media.

## 3. Font System

Global font stack:

`Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

Do not import external fonts unless a future controller/design review approves it.

## 4. Typography Scale

- Page hero title: 30px, weight 750
- Page title: 28px, weight 750
- Section title: 22px to 24px, weight 750
- Card title: 17px to 18px, weight 700
- Body: 16px, weight 500
- Button: 15px to 16px, weight 650
- Metadata: 13px, weight 500
- Small label: 12px, weight 700, uppercase, letter spacing 0.04em
- KPI number: 30px to 36px, weight 800
- Timer: 38px to 44px, weight 800

Only important titles, employee names, and numbers should be bold.

## 5. Button Styles

Primary button:

- Background: `#061426`
- Hover or pressed background: `#0B1F33`
- Text: `#FFFFFF`
- Border: none
- Height: 50px to 52px
- Radius: 14px
- Font weight: 650

Secondary button:

- Background: `#FFFFFF`
- Text: `#061426`
- Border: `1px solid #CBD5E1`
- Height: 46px
- Radius: 14px
- Font weight: 600

Soft button:

- Background: `#F8FAFC`
- Text: `#061426`
- Border: `1px solid #E2E8F0`

Success button:

- Background: `#15803D`
- Text: `#FFFFFF`

Danger action:

- Background: `#FEF2F2`
- Text: `#DC2626`
- Border: `1px solid #FECACA`

Only the primary action should be dark filled. Do not place multiple dark filled buttons side by side.

## 6. Card Styles

Main card:

- Background: `#FFFFFF`
- Border: `1px solid #E2E8F0`
- Border radius: 22px
- Box shadow: `0 10px 26px rgba(6, 20, 38, 0.07)`
- Padding: 18px

Inner card:

- Background: `#F8FAFC`
- Border: `1px solid #E2E8F0`
- Border radius: 16px
- Padding: 14px

Cards should be compact, calm, and useful. Avoid oversized bubbles, glow, and decorative gradients.

## 7. Input And Dropdown Styles

- Background: `#FFFFFF` or `#F8FAFC`
- Border: `1px solid #CBD5E1`
- Border radius: 14px
- Height: 48px to 52px
- Font size: 16px
- Text color: `#061426`

Dropdowns should use readable labels and preserve existing data/RBAC rules.

## 8. Status Chip Styles

Live or Working:

- Background: `#ECFDF5`
- Text: `#15803D`
- Border: `1px solid #BBF7D0`

Submitted:

- Background: `#ECFDF5`
- Text: `#15803D`

Pending:

- Background: `#FFF7E6`
- Text: `#D97706`

Declined or Error:

- Background: `#FEF2F2`
- Text: `#DC2626`

Development:

- Background: `#EFF6FF`
- Text: `#2563EB`
- Border: `1px solid #BFDBFE`

Chips should be small semantic indicators, not large decorative badges.

## 9. Navigation Styles

Top header:

- Use the same compact header across all tabs.
- Show logo, company name, optional user name, development chip only in development mode, and notification bell.
- Do not show `Logged in:`.
- Do not show duplicate refresh controls.
- Do not use pure black.
- Do not crowd the header.

Bottom navigation:

- Tabs: Home, Schedule, Clock, Timesheets, More
- Background: `rgba(255, 255, 255, 0.96)`
- Border top: `1px solid #E2E8F0`
- Height: about 72px including safe area
- Active color: `#061426`
- Inactive color: `#64748B`
- Active state should use Royal Navy icon/text with a small indicator or soft selected background.
- If a pill style is used, use `#061426`, reduce pill height/width, and avoid oversized black pills.

## 10. Empty State Styles

Empty states should use:

- Soft surface background `#F8FAFC`
- Border `#E2E8F0`
- Compact padding
- One clear message
- One next-step CTA only when useful

Avoid giant dashed empty boxes and decorative illustrations.

## 11. Do / Don't Rules

Do:

- Use Royal Navy FieldOps UI tokens.
- Use white cards on the `#F4F7FB` app background.
- Keep buttons, chips, filters, modals, menus, submenus, and forms consistent.
- Use semantic color only when it carries meaning.
- Keep mobile touch targets comfortable.
- Check hook order when editing React views.

Don't:

- Add new hard-coded colors without controller/design review.
- Use pure black as the main theme.
- Mix old black/navy/green/pastel styles with the Royal Navy system.
- Use emoji icons in professional buttons.
- Use heavy glow, neumorphic bubble effects, or random gradients.
- Make destructive actions visually dominant outside a confirmation flow.

## 12. Screenshot Review Checklist

Before completing future UI work, review screenshots or a signed-in QA session for:

- Home
- Clock
- Schedule
- Timesheets
- Team
- Photos
- Receipts
- More/Menu
- Settings
- Reports, if available
- Request Center, if available
- Modals, dropdowns, filters, toast messages, and empty states

Each screen should use the same Royal Navy tokens, readable typography, compact cards, consistent navigation, semantic status chips, and no mixed legacy visual styles.
