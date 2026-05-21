## Overview

Build "WelZeker Schadebeheer" — a Dutch-language insurance claims management app for Tom Declercq / WelZeker. The Dashboard matches the supplied mockup; the other 8 sidebar items become real pages wired to Lovable Cloud (Supabase) with Microsoft 365 SAML SSO restricted to the `welzeker.be` domain.

## Design system

Set up tokens once in `src/styles.css` so every component pulls from them — no hard-coded hex values in JSX:

- Colors (oklch equivalents of the supplied hex):
  - `--primary` #8DB92E, `--primary-dark` #5A7A1A, `--primary-light` #EEF5D6
  - `--background` #F5F5F2, `--card` #FFFFFF
  - `--foreground` #2C2C2A, `--text-secondary` #5F5E5A, `--text-muted` #888780
  - `--border` rgba(0,0,0,0.12)
  - Status soft pairs: green (#EEF5D6 / #5A7A1A), amber (#FAEEDA / #854F0B), blue (#E6F1FB / #185FA5), red (#FCEBEB / #A32D2D)
- Radius: `--radius-card` 12px, `--radius-element` 8px
- Inter via Google Fonts; only weights 400 and 500 loaded (no 600/700 ever)
- Flat: no gradients, no shadows; cards = white + 0.5px border + 12px radius
- Section headings: #8DB92E text + 1px bottom border in #EEF5D6
- Tables: alt hover only, 0.5px bottom border per row
- Sentence case; ALL CAPS only on 10px metadata labels (sidebar section labels, table headers)
- Tabler Icons (`@tabler/icons-react`) — already matches the mockup `ti ti-*` names

## Stack & architecture

- Routing: **TanStack Router** (the stack default; React Router DOM is not used here). File-based routes under `src/routes/`.
- Backend: **Lovable Cloud** (Supabase under the hood) — provisioned at the start of the build.
- Auth: **Microsoft 365 SAML SSO** via `supabase.auth.signInWithSSO({ domain: "welzeker.be" })`, mirroring the existing welzekerportaal pattern. Sign-in restricted to `@welzeker.be` accounts. *After provisioning, you (the user) will need to configure the SAML SSO connection in Lovable Cloud → Auth → SSO with your Microsoft Entra tenant metadata — same setup as welzekerportaal.*
- State: TanStack Query (already in template) for all DB reads via `createServerFn` + `requireSupabaseAuth`.

## Route map

```
src/routes/
  __root.tsx                         shell + QueryClient + auth-state invalidation
  login.tsx                          Microsoft SSO button, welzeker.be only
  _authenticated.tsx                 layout: redirect to /login if !session, renders AppShell (sidebar + topbar)
  _authenticated/index.tsx           Dashboard (matches mockup exactly)
  _authenticated/dossiers.tsx        list table with filters/search
  _authenticated/dossiers.$id.tsx    detail page
  _authenticated/nieuwe-schade.tsx   new-claim form
  _authenticated/schadeberekening.tsx
  _authenticated/bestekanalyse.tsx
  _authenticated/regelingsdocumenten.tsx
  _authenticated/excel-import.tsx
  _authenticated/auditrapport.tsx
  _authenticated/instellingen.tsx
```

The full skeleton ships in this pass: every page renders its real header, primary card layout, and basic interactions. Heavy domain logic (ABEX calc engine, AI bestek analysis, PDF generation) gets stub UI + TODO notes — real implementations are follow-up tasks.

## Database (Lovable Cloud)

Migration creates these tables with RLS (`auth.uid()`-scoped policies; everyone in the welzeker.be tenant can read/write):

- `dossiers` — id, customer_name, customer_type, damage_type, damage_date, insurer, amount, status, assigned_to, created_at, updated_at, notes
- `insurers` — id, name, color_token, max_authority_amount (powers the "Regelingsbevoegdheid" card and insurer badges)
- `abex_index` — id, value, period_label, updated_at (current active row drives the dashboard banner)
- `audit_log` — id, dossier_id, actor_id, action, payload, created_at
- `settings` — single-row key/value for app-wide config

Seed: 4 insurers (Baloise, AXA, Vivium, AG) with the mockup's authority limits and badge colors; one ABEX row (958, "nov–dec 2025"); 4 sample dossiers matching the mockup so the Dashboard renders identically on first load.

## Dashboard implementation (matches mockup 1:1)

- ABEX banner (light-primary background + 0.5px primary border) reading from `abex_index`
- 4 stat cards: Lopende dossiers, In behandeling, Afgehandeld (2025), Totaal vergoed — computed from `dossiers`
- Recente dossiers table (left, ~2/3 width): 5 most recent, with insurer badge, amount, status dot + label, chevron link to detail
- Right column: Snelle acties (3 action buttons → routes) + Regelingsbevoegdheid summary from `insurers`

## Shared components

- `AppSidebar` — 220px white, three sections (Beheer / Tools / Instellingen), active item uses primary-light bg + primary-dark text, footer with current user name + role
- `Topbar` — page title + subtitle + primary action slot
- `StatCard`, `SectionHeading`, `InsurerBadge`, `StatusDot`, `DataTable` — all token-driven

## Verification

1. Build passes, no TypeScript or import errors.
2. `/login` shows Microsoft SSO button; unauthenticated visit to any `_authenticated/*` route redirects to `/login`.
3. Dashboard renders the seeded data and visually matches the mockup (sidebar, banner, 4 stat cards, recent dossiers table, snelle acties, regelingsbevoegdheid).
4. Each sidebar route navigates and shows its scaffold without errors.
5. No 600/700 font weights present in compiled CSS; no gradients or box-shadows on cards.

## What is NOT in this pass

- Real ABEX calculation engine, AI bestek analysis, PDF regelingsdocument generator, Excel import parsing — scaffolded UI + TODOs only.
- Per-user roles (everyone authenticated can read/write). Add later via `user_roles` table if needed.
- Email notifications.
