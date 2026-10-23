# CodeMarket

CodeMarket is a React + TypeScript marketplace with an Express API and a Prisma/SQLite data store. Owner decisions control project publication and retail pricing; student UPI payments are reviewed manually and developer payouts remain in a 48-hour escrow ledger.

## Architecture

```text
client/src/
  context/       Authentication state
  components/    Shared marketplace UI
  pages/         Buyer, seller, and owner workspaces
  lib/api.ts     API URL and authenticated request helpers
server/src/
  middleware/    JWT authentication and role checks
  routes/        Auth, projects, payments, owner/admin APIs
  utils/         Upload storage helpers
prisma/schema.prisma
```

The persisted model includes separate developer-agreed and student-retail prices, project review status and integrity score, seller contact/payout QR details, UTR and screenshot references, payment verification state, escrow timestamps, and the manual payout audit trail.

## Local setup

Install packages from the project root, `client`, and `server` directories with `npm install` in each. Local API, Prisma commands, and owner seeding load the ignored project-root `.env`. The supplied local `.env` uses the requested development settings. `DATABASE_URL="file:./dev.db"` resolves against `prisma/schema.prisma`, so the active local database is `prisma/dev.db`. The existing `server/dev.db` is left untouched.

```powershell
npm install
npm --prefix server install
npm --prefix client install
npm run db:generate
npm run db:push
npm run seed:owner
npm run dev
```

`npm run dev` starts both local services. The frontend runs at `http://localhost:5173`, the API at `http://localhost:4000`, and the database readiness endpoint is `GET http://localhost:4000/api/health`.

### Provision the owner account

Set `OWNER_EMAIL` and `OWNER_PASSWORD` in the ignored project-root `.env`, then run `npm run seed:owner` from the project root. Seeding creates an `ADMIN` account when absent or synchronizes the password hash for an existing `ADMIN` with the same email, preserving its current status. It refuses to change an existing non-admin account. Public registration does not allow the `ADMIN` role. The requested local password is shorter than the recommended 12-character minimum; use a unique, stronger password before exposing this app beyond your laptop.

Sign in with that account and open `/owner/dashboard`.

## Owner workflow

1. In **Project pipeline**, review submissions, set a developer-agreed price and student retail price, record a manual integrity review score, optionally apply the Assured badge, and publish, negotiate, or keep the project pending.
2. In **Platform settings**, configure the owner collection UPI ID and QR image URL.
3. Buyers scan the owner QR, submit the UTR and a payment screenshot, and wait for manual confirmation.
4. Confirmation creates project access and locks the payment for 48 hours. After the maturity time, the owner can move the agreed developer value to the manual payout ledger, transfer to the developer's saved QR, and record the outbound transfer reference.
5. **Accounts** allows the owner to suspend or restore buyer and seller access. Server-side authorization checks current account status on every protected request.

The owner console exposes authenticated API routes under `/api/admin`: `/overview`, `/projects`, `/projects/:id/pricing`, `/payments`, `/payments/:id/verify`, `/payments/:id/release-escrow`, `/payouts`, `/payouts/:id/mark-paid`, `/users`, `/users/:id/status`, and `/settings`.

## Buyer, seller, and institution workflows

- Project uploads are inspected locally from their ZIP central directory. The owner sees source-file and line counts, declared dependencies, detected languages, basic review flags, and exact archive-hash matches. A bounded, deterministic estimate is advisory only; it is not an AI valuation or plagiarism verdict.
- Buyers can inspect a technology-derived architecture tour, use offline viva practice prompts, request a documentation PDF, subscribe to in-app price-drop alerts, and message the seller. Chat blocks common phone, email, payment-handle, and external-contact patterns; it is not a substitute for moderation.
- Project purchases issue a per-purchase activation reference. Delivered source archives add a hidden license record and prepend supported text source files with a signed comment containing encoded buyer and purchase metadata. The HMAC uses `CODEMARKET_WATERMARK_SECRET`, or `JWT_SECRET` when no watermark-specific secret is set. This enables attribution but cannot prevent a buyer from copying or redistributing files.
- Owner payment review can inspect the private submitted screenshot and confirm or reject the UTR. Confirmation creates the purchase access record and starts a 48-hour escrow hold; the marketplace does not independently verify bank settlement.
- Sellers can submit versioned ZIP updates for owner review and reply to project-specific buyer conversations. The owner chooses whether an approved update is included or separately priced, including a separate agreed seller value. Paid updates use the existing manual UPI verification and 48-hour escrow workflow; free updates are included with base-project access.
- Seller loyalty bands use sale counts and recorded review scores as indicative metrics. They do not change an owner-agreed payout amount.
- Owners can issue seat-limited, category-scoped college licenses after recording the already-received annual fee and its transfer reference. Student redemption is limited to active, unexpired licenses. Subscription collection remains a manual owner process.
- Notifications are in-app only and are generated for price changes, payment decisions, seller payouts, and approved project updates.

## Payment and review boundaries

- The public buyer checkout uses only the owner-configured manual UPI destination; payment proof is stored privately and can only be read through the admin API.
- No seller payout is automatically transferred. The payout ledger is accounting/audit state and requires an owner-initiated external transfer.
- `integrityScore` remains an owner-recorded review value. There is no external source-code plagiarism search, generative AI provider, GitHub OAuth integration, email/push delivery, or automated institutional billing configured. Viva prompts, price suggestions, source flags, architecture views, and report content are locally generated and explicitly advisory.
- A generated academic report summarizes submitted metadata and the source README; it does not assert correctness, authorship, originality, or compliance with university policies. The buyer must review and adapt the report.
- Source archive review and personalized ZIP delivery reject encrypted, path-traversal, duplicate-path, oversized, or unsupported archive content; analysis caps expanded source data at 100 MB.
- The QR image URL must be configured before checkout is available. In production, use a trusted HTTPS asset host, persistent private file storage, HTTPS application URLs, a managed database, and secret-manager-provided environment variables.

## Local workflow verification

Run the isolated archive-watermark test from `server`. It writes only temporary files and does not use the marketplace database:

```powershell
npm run test:watermark
```

The authenticated workflow check requires the local API and SQLite database to be running. If valid owner credentials are supplied as `CODEMARKET_OWNER_EMAIL` and `CODEMARKET_OWNER_PASSWORD`, the test logs in as that owner. If neither is supplied, it creates a temporary local admin account directly in SQLite solely for the test and removes it afterward. It creates temporary buyer, seller, category, project, and institution fixtures; redeems and downloads under an institutional license; uploads a synthetic payment screenshot through the real manual UPI endpoint; checks the owner ledger and private screenshot endpoint; confirms the payment via the owner API; verifies the 48-hour escrow lock and buyer purchase download; then checks the signed source watermark and cleans up its test records and files:

```powershell
npm run test:local-e2e
```

The integration test uses the existing SQLite schema and does not run migrations. It is intended for a local development database, not production.

To run the same local integration against the actual owner account, use the PowerShell helper from `server`. It prompts for credentials without echoing the password, passes them only to the test process, and clears the temporary environment values on exit:

```powershell
.\scripts\run-owner-e2e.ps1
```

The seeded owner password previously entered into chat should be changed before production. From `server`, run the local rotation helper and enter a new password at its hidden prompt:

```powershell
.\scripts\rotate-owner-password.ps1
```

The helper updates only an existing active `ADMIN` account, hashes the new password with bcrypt, and never writes or prints the plaintext password. Re-run `.\scripts\run-owner-e2e.ps1` afterward to verify the newly rotated owner login and the manual payment/institution workflow.

## Production deployment boundary

The repository now includes a self-hosted Docker deployment for a VPS with persistent volumes:

1. Install Docker Engine and the Docker Compose plugin on the host, configure TLS with a reverse proxy, and point the DNS hostname at that proxy.
2. Copy `.env.production.example` to `.env.production`, set `SERVER_PUBLIC_URL` to the public HTTPS origin, and replace `JWT_SECRET` with at least 32 randomly generated characters. Restrict `.env.production` permissions and keep it out of source control.
3. Start the service with `docker compose up --build -d`. The image serves the built web client and API from the same origin, applies the initial Prisma migration to its SQLite volume, and binds the app only to `127.0.0.1:4000` for the TLS proxy.
4. Configure the reverse proxy to forward to `127.0.0.1:4000`, and verify `https://<your-host>/api/health`. Both SQLite data and uploaded project/payment files use named persistent Docker volumes.
5. Back up and test restoring both `codemarket_data` and `codemarket_uploads`; stop the app during a simple file-copy backup, or use a SQLite-aware online backup procedure. Keep backups encrypted and access-controlled.

The checked-in initial migration is intended for an empty production volume. Do not point `migrate deploy` at the populated development SQLite database; migrate existing data only with a separately planned, backed-up baseline/restore procedure. A Docker/VPS deployment configuration is prepared, but it has not been launched because no VPS, hostname, TLS reverse proxy, or production secrets were supplied. No SMTP/push provider, GitHub OAuth application, or AI/plagiarism provider credentials have been supplied; those optional integrations remain unconfigured. Do not deploy the development SQLite file or use the default development JWT secret.

The owner dashboard, activity chart, and 3D modules are lazy-loaded so public pages do not download those features up front. Recharts/D3 bundles are now split below Vite's 500 KB warning threshold. The Three.js engine remains a larger optional feature chunk; Vite reports it at about 746 KB minified, and it is loaded only by the 3D views. Removing that warning without changing the requested 3D experience requires either a lighter 3D implementation or accepting a higher warning threshold; the current build does not conceal it.
