# swpr-budget-mod

Budget modification request tool for Regional Strong Workforce.

## Notes for this revision

- The UI now uses an IEDRC-branded text fallback mark (`IEDRC`) and color treatment.
- To use an uploaded logo asset, place it at `/assets/iedrc-logo.png` and update the header markup/CSS to reference it.
- `status.html` provides a print/download-friendly request record view (browser print/save PDF).
- The email function source is in `SEND_APPROVAL_EDGE_FUNCTION.ts`; deploy it as Supabase Edge Function `send-approval`.
- Apply `DATABASE_SETUP.sql` in Supabase SQL Editor to provision `site_config`, `activity_management`, and status lookup support.
