# IPP Comparator

Internal tool to compare Independent Power Producers (IPPs), negotiate in immutable rounds, and let a Green Energy Subscriber (GES) lock one deal.

Stack: Next.js 14 (App Router) · NestJS 10 · PostgreSQL 16. IPPs have no login; the internal team enters everything.

## Run it

```bash
docker compose up -d                 # Postgres, schema auto-applied
cd backend && npm install
cp .env.example .env                 # then export these, or set them in your shell
npm run seed                         # demo data
npm run build && npm start           # API on :4000   (or: npm run start:dev)

cd ../frontend && npm install
npm run dev                          # app on :3000
```

Without Docker, create a database and run `npm run migrate` in `backend/` instead of the compose step.

Demo logins (password `Passw0rd!`): `admin@ipp.test`, `procurement@ipp.test`, `reviewer@ipp.test`, `viewer@ipp.test`, and the GES users `meera@sahyadristeel.example` / `arjun@konkancold.example`.

Set `JWT_SECRET` before any real use.

## Tests

`cd backend && npm run test:e2e` runs 55 checks against a running API and seeded database: field visibility for GES, role limits, round immutability (API and database), draft rules, feasibility, comparator, the lock, auto-closure, and a race between two simultaneous lock attempts. The test mutates data (it locks the demo deal), so run `npm run seed` on a fresh database afterwards.

## How the rules are enforced

| Rule | Where |
|---|---|
| Submitted rounds, their terms and attachments cannot change or be deleted | Postgres triggers in `db/schema.sql`, plus API checks |
| One draft round per deal; no gaps in round numbers | Partial unique index; `UNIQUE(deal_id, round_no)`; row lock when creating a round |
| Audit log, feasibility events and deal locks are append-only | Triggers block UPDATE and DELETE |
| Locked and closed deals are terminal; no new rounds | Deal trigger and round trigger |
| One locked deal per requirement | Partial unique index and a transaction that locks every deal of the requirement in a fixed order |
| Lock closes the other IPP deals atomically | `NegotiationService.lock` (single transaction) |
| GES never sees internal data | `stripTermsForGes` and the deal serializer; internal remarks, margin and credit notes are removed server-side, plus any field the team marks "Hide from subscriber" |
| GES can lock only a Feasible, unexpired round | Checked inside the lock transaction |

## Where things are

- `db/schema.sql`: tables, indexes, triggers
- `backend/src/deals/negotiation.service.ts`: rounds, feasibility, lock
- `backend/src/comparator/`: landed cost and levelised cost
- `frontend/components/MindMap.tsx`: the negotiation map (and the Obsidian `.canvas` export)
- `frontend/app/(app)/deals/[id]/page.tsx`: round timeline, editor, lock

## Decisions made where the requirements left a choice

- Feasible rounds expire at the tariff validity date (the team can override per mark). Withdrawing a mark needs a reason and is recorded as an event.
- A reviewer's approval before a round is submitted is not built; procurement and admin submit directly.
- IPP names and rounds are visible to the GES for deals on their own requirement.
- Attachments are links, not file uploads.
- Locked deals can never be unlocked, including by admins.
