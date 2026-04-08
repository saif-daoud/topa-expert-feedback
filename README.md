# TOPA Expert Feedback

This app is a separate expert-feedback survey based on `interface/topa-survey`.

## Frontend

- Folder: `frontend`
- GitHub Pages base path: `/topa-expert-feedback/`
- Local API base: `http://127.0.0.1:8788/api`

## Worker

- Folder: `worker`
- Worker name: `topa-expert-feedback-worker`
- Local dev port: `8788`
- D1 database name: `topa_expert_feedback_db`
- Replace `REPLACE_WITH_FOLLOWUP_D1_DATABASE_ID` in `worker/wrangler.toml` before deployment.
- Replace `TOKEN_SECRET` in `worker/.dev.vars` before local or remote use.
- Apply the latest D1 migrations before deploying so `followup_assignments` and the new response coverage columns exist.

## Data sources

- Follow-up comparisons: `frontend/public/data/followup_comparisons.json`
- Question wording source: `frontend/public/data/followup_questions.md`
- Method outputs are copied from the original survey data so this app remains self-contained.

## Notes

- Browser storage keys are namespaced (`topa_expert_feedback_*`) so this app does not collide with the hosted `topa-survey`.
- Responses are stored in `followup_responses`, not `votes`.
- The follow-up survey now assigns 30 comparisons per expert from the low-coverage pool and tracks assignment coverage in the database.
