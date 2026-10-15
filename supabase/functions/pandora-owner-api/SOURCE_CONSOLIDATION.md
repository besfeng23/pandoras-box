# Supabase Owner API canonical source consolidation

## Active source

The active repository source is `supabase/functions/pandora-owner-api/`. It is the only source directory intended for a future canonical deploy. Do not overwrite it with historical runtime patch contents.

At the consolidation baseline (`f6b3759117db167bf9a2666f55fa290b77f116fe`), the canonical source was verified to contain:
- The v76 Build Theatre behavior: `buildTheatreSummary`, the `pandora_build_theatre_projection` read, and truthful idle-state handling.
- The v100 CORS addition: `https://enterprise-omega-five.vercel.app` in `contract.ts`.
- `command-pipeline.mjs` shared with the v76 patch (same Git blob `0356dd7db7e22390764caaaec0fcbe9b45da886d`).
- A newer `operational-workspace.mjs` than the v76 snapshot.

## Historical patch handling

The redundant v76/v100 patch copies have been removed from the working tree. Git history preserves the earlier patch revisions; do not recreate archive folders inside the repository. The current tree should contain only the canonical implementation and the behavior tests that validate it.

## Deployment boundary

The Supabase function inventory reported `pandora-owner-api` version 105 at audit time. This repository comparison describes Git source; it does not claim deployed-source equivalence. Exact deployed-source equivalence must be established separately before production verification or deployment.
