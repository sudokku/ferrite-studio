# ferrite-studio — Agent Memory

## Project status
- React SPA fully scaffolded under `frontend/`
- All 5 workflow tabs + auth/profile/library/admin implemented
- Auth: JWT in httpOnly cookies via FastAPI; AuthContext + ProtectedRoute pattern
- Left sidebar layout with system auto dark/light mode (Tailwind `darkMode: 'media'`)
- All API wrappers in `src/api/`
- SSE hook: `src/hooks/useSSE.ts`
- Tab unlock helper: `src/lib/tabUnlock.ts`
- Build confirmed passing: `npm run build` produces 708 kB JS + 16 kB CSS, zero TS errors

## Key file locations
- `frontend/src/context/AuthContext.tsx` — AuthProvider + useAuth hook (calls /auth/me on mount)
- `frontend/src/components/Layout.tsx` — sidebar with bitmask unlock, user identity, logout button
- `frontend/src/pages/ArchitectPage.tsx` — layer builder; "Save to my library" button when logged in
- `frontend/src/pages/DatasetPage.tsx` — CSV/IDX/built-in upload
- `frontend/src/pages/TrainPage.tsx` — start/stop + SSE; "Save to my library" after training done
- `frontend/src/pages/EvaluatePage.tsx` — metrics + confusion matrix
- `frontend/src/pages/TestPage.tsx` — model selection + inference
- `frontend/src/pages/LoginPage.tsx` — centered card; calls login() then getMe() to populate AuthContext
- `frontend/src/pages/RegisterPage.tsx` — centered card; redirects to /login on success
- `frontend/src/pages/ProfilePage.tsx` — update profile, change password, delete account (inline confirm)
- `frontend/src/pages/LibraryPage.tsx` — saved architectures + models; "Load" uses saveArchitect() Rust endpoint
- `frontend/src/pages/AdminPage.tsx` — stats bar + users table with role toggle + delete; admin-only
- `frontend/src/api/auth.ts` — register, login, logout, getMe, updateProfile, changePassword, deleteSelf
- `frontend/src/api/userResources.ts` — listArchitectures, saveArchitecture, deleteArchitecture, listModels, importModel, getModelDownloadUrl, deleteUserModel
- `frontend/src/api/admin.ts` — listUsers, adminDeleteUser, updateUserRole, getStats
- `frontend/src/api/` — all other typed fetch wrappers
- `frontend/src/hooks/useSSE.ts` — EventSource hook for /api/train/events
- `frontend/src/lib/tabUnlock.ts` — bitmask constants and helper
- `frontend/src/lib/utils.ts` — cn() Tailwind merge utility
- `frontend/src/components/ui/` — hand-written shadcn-style primitives

## Stack versions confirmed
- Vite 7 (scaffolded with create-vite@8 despite Node advisory — builds fine)
- React 19 + TypeScript (strict mode, `noUnusedLocals`, `noUnusedParameters`)
- Tailwind CSS 3 (`darkMode: 'media'` for system auto theme)
- Recharts for loss/accuracy charts
- TanStack Query v5 (queryKey factory pattern: `['architect']`, `['dataset']`, `['train']`, `['evaluate']`, `['test', selectedModel]`)
- React Router v7 (BrowserRouter + nested Routes under Layout outlet)

## UI component inventory (src/components/ui/)
Hand-written shadcn-style, no CLI needed:
- `button.tsx` — variants: default, outline, ghost, destructive, secondary; sizes: default, sm, lg, icon
- `card.tsx` — Card, CardHeader, CardTitle, CardContent, CardDescription
- `badge.tsx` — variants: default, secondary, destructive, outline
- `input.tsx` — standard text/number/file input
- `label.tsx`
- `select.tsx` — native select with ChevronDown icon overlay
- `progress.tsx` — simple progress bar
- `separator.tsx` — horizontal/vertical divider
- `textarea.tsx`

## Tab unlock bitmask values
```
TAB_ARCHITECT = 0x01  // always unlocked
TAB_DATASET   = 0x02  // unlocked when spec saved
TAB_TRAIN     = 0x04  // unlocked when dataset loaded
TAB_EVALUATE  = 0x08  // unlocked after training done/stopped
TAB_TEST      = 0x10  // always unlocked
```
Default before first API response: `0x11` (Architect + Test).

## TanStack Query key conventions
- `['architect']` — GET /api/architect (staleTime: 5s in Layout, 10s default)
- `['dataset']` — GET /api/dataset
- `['train']` — GET /api/train (refetchInterval: 3000 during train page)
- `['evaluate']` — GET /api/evaluate
- `['test', selectedModel]` — GET /api/test?model=NAME
- `['user-architectures']` — GET /user/architectures
- `['user-models']` — GET /user/models
- `['admin-stats']` — GET /admin/stats
- `['admin-users', page]` — GET /admin/users?limit=50&offset=N

## SSE hook pattern
`useTrainSSE(enabled: boolean)` returns `SSEState`:
- `enabled` gates the EventSource connection
- Cleans up via `useEffect` return
- Parses `epoch`, `done`, `stopped`, `failed` named events
- Stores accumulated epoch array for live charting
- On `done`/`stopped`: closes EventSource, sets `status: 'done'`

## Conventions confirmed
- API calls ONLY through `src/api/` wrappers — never raw fetch in components
- `void qc.invalidateQueries(...)` to satisfy `noUnusedLocals` with Promise return
- `darkMode: 'media'` in tailwind.config.ts — no manual toggle needed
- CSS vars in `src/index.css` using `@media (prefers-color-scheme: dark)` block
- Vite proxy: `/api` → Rust :7878; `/auth`, `/user`, `/admin` → FastAPI :8000
- TypeScript `tsconfig.app.json` holds the `paths`/`baseUrl` aliases (not root tsconfig.json)
- All fetch calls to /auth, /user, /admin must include `credentials: 'include'` for httpOnly cookies
- ProtectedRoute: reads `useAuth().loading` — returns null while loading (prevents flash redirect)
- Auth page layout: no sidebar, full-screen centered card with Brain icon + app name branding
- Inline delete confirmation pattern: toggle `showDeleteConfirm` state, show confirm form in place (no dialog lib)
- Admin role guard: check `user?.role === 'admin'` at page level, show "Not authorized" card if not admin

## Known issues / watch-outs
- Node.js 22.2.0 triggers a Vite advisory (requires 20.19+ or 22.12+) — build still succeeds
- Chunk size warning (679 kB) is expected — no code splitting yet
- `noUnusedParameters` is on: unused function params must be prefixed with `_`
