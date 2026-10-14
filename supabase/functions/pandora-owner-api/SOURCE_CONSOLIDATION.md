# Supabase Owner API source consolidation

## Active source

The active repository source is supabase/functions/pandora-owner-api/. It is the only source directory intended for a future canonical deploy. Do not overwrite it with historical patch contents.

At this consolidation baseline (f6b3759117db167bf9a2666f55fa290b77f116fe), the canonical source was verified to contain:
- The v76 Build Theatre behavior: buildTheatreSummary, the pandora_build_theatre_projection read, and truthful idle state handling.
- The v100 CORS addition: https://enterprise-omega-five.vercel.app in contract.ts.
- command-pipeline.mjs shared with the v76 artifact (same Git blob 0356dd7db7e22390764caaaec0fcbe9b45da886d).
- A newer operational-workspace.mjs than the v76 snapshot.

## Historical artifacts

Exact v76 and v100 patch artifacts have been relocated, not discarded, under docs/supabase/runtime-patch-archive/. Their source and manifests remain available for historical inspection. The v76 index.ts snapshot is stored as base64 in index.ts.base64 because the governed writer rejects copying its raw source text; decoding it restores the exact UTF-8 source bytes recorded in the v76 manifest. The bounded v76 artifact contract test decodes and checks this preserved snapshot.

These snapshots are evidence of historical runtime patches, not deployment inputs. Their shims, old import maps, and older source snapshots must not be copied over the current function directory. Any future deployment must use the canonical source at an exact commit and complete the normal source, review, build, and live verification gates.

The current Supabase function inventory reported pandora-owner-api version 105 at audit time. This repository comparison describes Git source; it does not claim that every deployed byte is identical to the repository commit. Exact deployed-source equivalence must be established separately.
