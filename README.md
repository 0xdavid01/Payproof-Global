# PayProof Platform

PayProof is a freelancer project and payment workflow that brings project scope, agreements, work submissions, and escrow funding into one place. Clients and freelancers manage a project through a React web app backed by a Spring Boot API, with NEAR smart contracts handling supported on-chain escrow operations.

This repository contains the web client, API, and Rust contract workspace. Each is built and run independently; there is no root-level build command.

## At a glance

| Area | Technology | Responsibility |
|---|---|---|
| `payproof-frontend/` | React, Vite, JavaScript | Web application for clients and freelancers |
| `payproof/` | Java, Spring Boot, Maven | Authentication, projects, agreements, submissions, activity, storage, and escrow API |
| `near_hackathon/` | Rust, NEAR SDK | Escrow and admin smart contracts, plus a test USDT fungible-token stub |
| Database | PostgreSQL, Spring Data JPA | Users, projects, submissions, wallets, activity, and JDBC-backed sessions |
| File storage | Cloudflare R2 | Project documents, agreements, and submitted work |
| External services | Google OAuth, Resend, DeepSeek, NEAR RPC | Optional sign-in, email, AI assistance, and blockchain operations |

## Product workflow

The application is organized around a project shared by a client and a freelancer:

1. A user registers or signs in. Password sign-in uses a one-time email code; Google OAuth is also supported by the backend.
2. The client creates a project, records its financial terms, and can upload a project requirements document.
3. The participants review project requirements and the agreement, accept or decline an invitation, and request or approve contract changes.
4. The freelancer submits work as a file, external URL, or notes. The client can review submission versions.
5. The client prepares and funds an escrow. NEAR, USDT, and USDC are represented by the contract's supported asset types; transaction details are checked by the backend.
6. Work approval, refunds, and dispute handling are represented in the escrow lifecycle. Available actions depend on the user's role and the project's state.

The frontend includes overview, projects, project details, agreement review, escrow funding, submissions, payment receipts, and activity pages. The API and contracts enforce the underlying workflow; the frontend alone is not an authorization boundary.

## Repository layout

```text
payproof-platform/
├── payproof/                         # Spring Boot API
│   ├── .mvn/                         # Maven Wrapper support
│   ├── src/main/java/com/example/payproof/
│   │   ├── config/                   # Security, authentication, Jackson, passwords
│   │   ├── controller/               # REST endpoints
│   │   ├── dto/                      # API request and response objects
│   │   ├── model/                    # JPA entities
│   │   ├── repository/               # Spring Data repositories
│   │   └── service/                  # Project, auth, escrow, storage, and NEAR logic
│   ├── src/main/resources/
│   │   └── application.properties    # Runtime settings and environment placeholders
│   ├── mvnw / mvnw.cmd               # Maven Wrapper launchers
│   └── pom.xml
├── payproof-frontend/                # React + Vite web client
│   ├── src/
│   │   ├── components/
│   │   ├── context/
│   │   ├── pages/
│   │   └── services/
│   ├── email-templates/
│   ├── package.json
│   └── vite.config.js
└── near_hackathon/                   # Rust Cargo workspace
    ├── contracts/
    │   ├── admin/                    # Admin and platform configuration
    │   ├── escrow/                   # NEAR / FT escrow lifecycle
    │   └── usdt-stub/                # Test-only FT stub; not a production token
    ├── src/
    ├── tests/
    ├── Cargo.toml
    └── rust-toolchain.toml
```

`near_hackathon/` is present as a directory in this checkout; the repository does not have a `.gitmodules` file. A normal clone is sufficient.

## Prerequisites

Install the tools needed for the part of the platform you intend to run:

- **Java 27** for the version declared by `payproof/pom.xml`.
- **Maven** is optional when using the included Maven Wrapper.
- **Node.js and npm** compatible with Vite 8.
- **Rust 1.93.0** and `rustup` for the pinned Rust toolchain.
- **PostgreSQL** for the API's database and persistent HTTP sessions.
- A NEAR testnet account and wallet for exercising on-chain flows.
- Optional provider accounts and credentials for Google OAuth, Resend email, Cloudflare R2, and DeepSeek.

The checked-in backend `Dockerfile` currently uses Java 21, whereas the Maven project declares Java 27. Reconcile those versions before relying on the Docker image build.

## Configuration

### Backend

The Spring application imports an optional `payproof/.env` file. Create it locally (do not commit it) and supply the values for the services you have configured. For example:

```dotenv
PORT=8080
DATABASE_URL=jdbc:postgresql://localhost:5432/payproof
DATABASE_USER=postgres
DATABASE_PASSWORD=replace-with-local-database-password

GOOGLE_CLIENT_ID=replace-with-google-client-id
GOOGLE_CLIENT_SECRET=replace-with-google-client-secret

RESEND_API_KEY=replace-with-resend-api-key
RESEND_FROM=PayProof <no-reply@example.com>
PAYPROOF_APP_URL=http://localhost:5173/

R2_ACCOUNT_ID=replace-with-r2-account-id
R2_ACCESS_KEY=replace-with-r2-access-key
R2_SECRET_KEY=replace-with-r2-secret-key
R2_BUCKET=replace-with-r2-bucket-name

DEEPSEEK_API_KEY=replace-with-deepseek-api-key

# Optional override; the application has a testnet default.
NEAR_USDT_CONTRACT_ID=replace-with-testnet-token-contract
```

The placeholders above are examples, not working credentials. Never commit real passwords, access keys, API keys, OAuth secrets, or wallet secrets. Use separate credentials and accounts for development and production.

| Variable / setting | Purpose |
|---|---|
| `PORT` | HTTP port; defaults to `8080`. |
| `DATABASE_URL` | JDBC URL for PostgreSQL. |
| `DATABASE_USER`, `DATABASE_PASSWORD` | Database login. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client. Configure the provider's authorized redirect URI for the backend deployment. |
| `RESEND_API_KEY`, `RESEND_FROM` | Email delivery, including login one-time codes. The sender must be valid for the configured Resend account/domain. |
| `PAYPROOF_APP_URL` | Application URL used when constructing links in email. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET` | Cloudflare R2 connection used for file storage. |
| `DEEPSEEK_API_KEY` | DeepSeek service configuration. |
| `NEAR_USDT_CONTRACT_ID` | Optional USDT token-contract override; the backend config supplies a testnet default. |
| `near.network`, `near.rpc-url` | Network and RPC settings; currently configured for NEAR testnet. |
| `near.escrow-contract-id`, `near.admin-contract-id`, `near.server-account-id` | NEAR contract/account configuration in `application.properties`; verify these for the environment you deploy. |

The backend config also sets JDBC session storage, a 30-minute session timeout, and secure cross-site cookies. Keep the cookie and CORS configuration aligned with the actual frontend and backend origins when deploying.

### Frontend

The frontend reads the following optional Vite variables:

| Variable | Purpose |
|---|---|
| `VITE_BACKEND_ORIGIN` | API origin. Leave unset to use same-origin requests. |
| `VITE_NEAR_NETWORK` | NEAR network; defaults to `testnet`. |
| `VITE_ESCROW_CONTRACT_ID` | Escrow contract ID used by wallet and transaction flows. Set it to the contract deployed for the selected network. |

For a local API, create `payproof-frontend/.env.local`:

```dotenv
VITE_BACKEND_ORIGIN=http://localhost:8080
VITE_NEAR_NETWORK=testnet
VITE_ESCROW_CONTRACT_ID=replace-with-testnet-escrow-contract
```

If `VITE_BACKEND_ORIGIN` is unset, the current Vite development proxy forwards `/api`, `/oauth2`, and `/login/oauth2` requests to the backend URL configured in `payproof-frontend/vite.config.js`. Set the origin above when you want the browser to call a local API directly. Re-start Vite after changing environment variables.

## Run locally

### 1. Start PostgreSQL

Create a local database (for example, `payproof`) and set the JDBC URL, username, and password in `payproof/.env`. The application uses JPA schema updates and initializes JDBC-backed Spring Session storage; use a disposable database for development and manage schema changes deliberately for production.

### 2. Start the API

From the repository root:

```powershell
cd payproof
.\mvnw.cmd spring-boot:run
```

On macOS or Linux, use `./mvnw spring-boot:run`. The API listens on `http://localhost:8080` by default.

### 3. Start the web app

In another terminal:

```powershell
cd payproof-frontend
npm ci
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). Configure `VITE_BACKEND_ORIGIN` as described above if you are using the local API.

### 4. Build and test the contracts

From the repository root:

```powershell
cd near_hackathon
cargo test --workspace
cargo build --workspace
```

For WebAssembly artifacts, install the pinned toolchain/target and `cargo-near`, then build the contract you intend to deploy from its crate directory. For example:

```powershell
rustup target add wasm32-unknown-unknown
cargo install cargo-near
cd contracts\escrow
cargo near build
```

Repeat from `contracts\admin` for the admin contract. Contract deployment and initialization require NEAR accounts, correct contract IDs, and a deliberate configuration procedure; compiling a contract does not deploy or configure it.

## API overview

The API is rooted at `/api`. Most project and escrow endpoints require an authenticated session. Login and registration use a cookie-based session; the frontend sends cookies with requests and obtains a CSRF token for state-changing requests.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/csrf` | Obtain the CSRF token used by the web client. |
| `POST` | `/api/auth/register` | Register a user. |
| `POST` | `/api/auth/login` | Verify email/password and begin the email-code sign-in step. |
| `POST` | `/api/auth/verify-otp` | Verify a six-digit login code and establish the session. |
| `POST` | `/api/auth/resend-otp` | Resend a pending login code. |
| `GET` | `/api/auth/me` | Return the current authenticated user. |
| `POST` | `/api/auth/logout` | Clear the current session. |
| `GET` | `/api/auth/google` | Begin Google OAuth sign-in; the callback is handled under Spring Security OAuth routes. |
| `GET`, `POST` | `/api/auth/wallet`, `/api/auth/wallet/challenge`, `/api/auth/wallet/verify`, `/api/auth/wallet/revoke` | Read or manage the signed-in user's linked NEAR wallet. |
| `GET` | `/api/jobs/client`, `/api/jobs/freelancer` | List projects for the current role. |
| `POST`, `GET` | `/api/jobs`, `/api/jobs/{jobId}` | Create and retrieve projects. |
| `POST`, `PUT` | `/api/jobs/{jobId}/prd`, `/api/jobs/{jobId}/financial-terms`, `/api/jobs/{jobId}/checklist/*` | Manage project documents, terms, and checklist state. |
| `POST` | `/api/jobs/{jobId}/invitation/accept`, `/api/jobs/{jobId}/invitation/decline` | Respond to a project invitation. |
| `POST` | `/api/jobs/{jobId}/contract`, `/api/jobs/{jobId}/contract/request-changes`, `/api/jobs/{jobId}/contract/approve` | Upload and review the project agreement. |
| `GET` | `/api/jobs/{jobId}/contract/download-url` | Get a time-limited agreement download URL. |
| `POST`, `GET` | `/api/jobs/{jobId}/submissions` | Submit work and list its submission versions. Submission upload accepts multipart form data. |
| `POST` | `/api/jobs/{jobId}/submissions/{versionId}/review` | Review a submission version. |
| `GET` | `/api/activity` | List project activity for the current participant. |
| `POST` | `/api/escrows` | Prepare an escrow operation. |
| `POST` | `/api/escrows/{escrowId}/confirm` | Confirm a submitted transaction after backend verification. |
| `POST` | `/api/escrows/jobs/{jobId}/reconcile-release` | Reconcile an escrow release with the job state. |

This is a route overview, not a complete API specification. See the controllers and request/response DTOs in `payproof/src/main/java/com/example/payproof/` for the current payloads and validation rules.

## Smart contracts

`near_hackathon/` is a Cargo workspace pinned by `rust-toolchain.toml` to Rust 1.93.0:

- **`contracts/escrow`** — escrow creation/funding, work submission and approval, refunds, disputes, freeze controls, settlement callbacks, and fee accounting. It supports NEAR and fungible-token assets (USDT/USDC) through NEAR's FT interface.
- **`contracts/admin`** — administrative configuration, pause controls, escrow freeze/unfreeze operations, and cross-contract configuration synchronization.
- **`contracts/usdt-stub`** — a lightweight test token contract. Its source explicitly has unrestricted test minting; it is not a real USDT token and must not be used as a production asset.

The backend's checked-in network settings point to NEAR testnet. Before testing or deploying, confirm that the frontend, backend, and contracts all use the same network and contract accounts. Never treat a successful local compile as evidence that deployed contracts are initialized, configured, or funded.

## Validation commands

Run commands from the corresponding project directory:

```powershell
# Backend tests
cd payproof
.\mvnw.cmd test

# Frontend static checks and production build
cd ..\payproof-frontend
npm run lint
npm run build

# Rust workspace tests
cd ..\near_hackathon
cargo test --workspace
```

The frontend package also provides `npm run preview` for serving a previously built `dist/` directory locally.

## Development and deployment notes

- **Sessions and CSRF:** the API uses cookie-backed sessions and CSRF protection. Do not remove `credentials: include`, CSRF handling, or server cookie protections when changing the frontend/API integration.
- **CORS and origins:** allowed frontend origins are configured in `payproof/src/main/java/com/example/payproof/config/SecurityConfig.java`. Update that allowlist when adding deployment origins; credentialed requests cannot use a wildcard origin.
- **Email:** password-based sign-in requires working email delivery so users can receive their one-time code. Verify the Resend sender/domain and application URL.
- **OAuth:** configure Google client credentials and the correct backend callback URL in the Google Cloud project.
- **File uploads:** the backend limits multipart file size in `application.properties` and expects R2 credentials/bucket configuration.
- **Secrets:** local `.env` files and Vite local env files are for development only. Store production credentials in the deployment platform's secret manager.
- **Testnet:** the configured NEAR network is testnet. Do not assume the checked-in account IDs, token contracts, RPC, or fee settings are appropriate for mainnet.
- **Schema management:** `spring.jpa.hibernate.ddl-auto=update` is convenient for development but is not a replacement for reviewed database migrations in production.
- **Deployment configuration:** review the current cookie `SameSite`/`Secure` settings, CORS allowlist, OAuth redirect URI, database/session persistence, storage access, and error-response settings for the target environment.

## Current caveats

- This repository has no root-level orchestration or single command that starts all components.
- The frontend development proxy currently targets a hosted backend unless `VITE_BACKEND_ORIGIN` is set.
- The Rust README in `near_hackathon/` contains generic auction-template guidance; the workspace members and contract source describe the PayProof contracts.
- The backend Maven configuration specifies Java 27, but the checked-in Dockerfile uses Java 21. Align them before using that Dockerfile.
- No license or production deployment guarantee is asserted by this README. Verify project ownership, dependency terms, provider settings, and deployment configuration before redistributing or launching.
