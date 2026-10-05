# Supabase dependency map before MongoDB + R2 migration

Captured from the clean checkpoint `535cb8f`. This is an implementation inventory, not a data transfer plan.

| Class | Current runtime users | Replacement boundary |
| --- | --- | --- |
| Frontend auth | `src/lib/supabase.ts`, `src/context/AuthContext.tsx`, `src/pages/LoginPage.tsx`, `src/pages/SignupPage.tsx`, password reset in `SettingsPage.tsx`, bearer token reads in `src/services/{project,billing,clip,clipRender}Service.ts` | Keep Supabase Auth and JWT retrieval. |
| Backend auth | `server/src/utils/supabase.ts`, `server/src/middleware/authMiddleware.ts`, `server/src/types/index.ts` | Keep token verification; `req.user.id` remains owner ID. |
| Frontend database | `src/context/AuthContext.tsx` (profiles and creator profiles), `src/services/projectService.ts` (projects, transcripts, outputs), `src/pages/SettingsPage.tsx` (profiles) | Express endpoints with owner-scoped Mongo repositories. |
| Backend database | `server/src/controllers/{project,clip}Controller.ts`; `server/src/services/{videoProcessing,contentGeneration,contentOutput,clipAnalysis,clipRender,smartReframe,caption,usage}Service.ts` | Mongo repositories. Preserve UUID API IDs and current response shapes. |
| Frontend storage | `src/services/storageService.ts` upload, `src/pages/ProjectDetailPage.tsx` source preview | Direct browser PUT to R2 via backend-issued URL; backend-issued signed GET preview. |
| Backend storage | `server/src/controllers/projectController.ts`; `server/src/services/{videoProcessing,clipRender,smartReframe}Service.ts` | Private R2 object service; stream to unique local files for processing; signed URLs only after ownership check. |
| RPC | `server/src/services/usageService.ts` reserve/settle/release/cleanup | Mongo atomic/transactional usage ledger. |
| RLS / SQL | `supabase/schema.sql`, `supabase/migrations/*.sql` | Historical only; repositories enforce owner scoping and relationships. |
| Tests / scripts | `server/src/tests/*`, `server/src/__tests__/*`, `scripts/*`, `server/src/scripts/*` include Supabase fixtures and live diagnostics | Replace runtime-focused tests; label old live scripts as legacy and never run against production automatically. |

## Migration order

1. Mongo connection, indexes, typed owner-scoped repositories, and R2 service.
2. Usage ledger and direct upload protocol, including frontend upload progress.
3. Core project, transcript, profile, and content API paths.
4. Clip finder, rendering, captions, and reframe paths.
5. Frontend direct database/storage calls, tests, and documentation.
6. Confirm no business-data Supabase runtime calls remain; keep Auth only.

The old SQL and scripts are references. No existing Supabase data or storage objects are to be deleted or transferred automatically.
