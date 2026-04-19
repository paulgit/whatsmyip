# AGENTS.MD

## Project Overview

This is a Node.js application designed to run in a Docker container with a strong emphasis on security, reliability, and maintainability.

## Tech Stack

* **Runtime:** Node.js (LTS version only)
* **Package Manager:** npm (with `package-lock.json` committed)
* **Containerisation:** Docker (multi-stage builds)
* **Language:** JavaScript / TypeScript (as applicable)

---

## Code Standards & Conventions

### General

* Use `strict mode` in all files.
* Prefer `const` over `let`; never use `var`.
* Use async/await over raw Promises or callbacks.
* All functions must have JSDoc or TSDoc comments.
* Keep files under 300 lines; extract modules when exceeding this.
* Use named exports over default exports.

### File & Directory Structure

```
├── src/              # Application source code
│   ├── routes/       # HTTP route handlers
│   ├── middleware/    # Express/Koa middleware
│   ├── services/     # Business logic
│   ├── models/       # Data models / schemas
│   ├── utils/        # Shared utilities
│   └── config/       # Configuration loaders
├── tests/            # Test files (mirrors src/ structure)
├── docker/           # Dockerfiles and compose files
├── scripts/          # Build, deploy, and utility scripts
├── .env.example      # Template for environment variables (never commit .env)
├── Dockerfile        # Production Dockerfile
├── docker-compose.yml
└── package.json
```

---

## Security Rules (CRITICAL)

These rules are **non-negotiable**. Every change must comply.

### Environment & Secrets

* **NEVER** hardcode secrets, API keys, tokens, or passwords in source code.
* All secrets must be injected via environment variables or a secrets manager at runtime.
* `.env` files must be listed in `.gitignore` and `.dockerignore`.
* Use `dotenv` only in development; in production, rely on container-level env injection.

### Dependencies

* Only install packages from the npm public registry with >1,000 weekly downloads unless explicitly approved.
* Run `npm audit` before every commit. **Zero critical or high vulnerabilities allowed.**
* Pin all dependency versions exactly in `package.json` (no `^` or `~` prefixes).
* Regularly update dependencies and review changelogs for security patches.
* Never use `eval()`, `Function()`, or any dynamic code execution.

### Input Validation & Output Encoding

* Validate and sanitise **all** user input at the boundary (route/controller level).
* Use a validation library (e.g., `zod`, `joi`, `class-validator`).
* Parameterise all database queries — **never** concatenate user input into queries.
* Escape all output rendered in HTML contexts to prevent XSS.

### Authentication & Authorisation

* Use well-established auth libraries (e.g., `passport`, `jsonwebtoken`).
* Never implement custom cryptography — use `crypto` from Node.js stdlib or `bcrypt`/`argon2`.
* Enforce least-privilege access on all endpoints.
* All tokens must have an expiry (`exp` claim for JWTs).

### HTTP & Network Security

* Set security headers using `helmet` middleware.
* Enable CORS with an explicit allowlist — never use `*` in production.
* Enforce HTTPS in production; redirect HTTP → HTTPS.
* Rate-limit all public-facing endpoints.
* Disable `X-Powered-By` header.

### Logging & Error Handling

* Use a structured logger (e.g., `pino`, `winston`) — never use `console.log` in production code.
* **Never** log secrets, tokens, passwords, or PII.
* Return generic error messages to clients; log detailed errors server-side only.
* Use a global error handler middleware; never leak stack traces to the client.

---

## Docker Rules (CRITICAL)

### Dockerfile Requirements

* Use **multi-stage builds** to keep the final image minimal.
* Base the production stage on `node:<version>-alpine` (LTS only).
* **Never run the application as root.** Create and use a non-root user:
  ```dockerfile
  RUN addgroup -S appgroup && adduser -S appuser -G appgroup
  USER appuser
  ```
* Copy only production artifacts into the final stage (`node_modules`, built code).
* Use `.dockerignore` to exclude: `.git`, `node_modules`, `.env`, `tests/`, `*.md`, `docker-compose*.yml`.
* Set `NODE_ENV=production` in the Dockerfile.
* Use `dumb-init` or `tini` as PID 1 to handle signals properly:
  ```dockerfile
  RUN apk add --no-cache tini
  ENTRYPOINT ["/sbin/tini", "--"]
  CMD ["node", "src/index.js"]
  ```
* Do **not** use `npm start` in production — call `node` directly to avoid unnecessary process wrapping.
* Set a `HEALTHCHECK` instruction in the Dockerfile.
* Never use `latest` tag for base images — always pin to a specific version.

### Docker Compose / Runtime

* Do not mount the host filesystem into the container in production.
* Use read-only filesystem where possible (`read_only: true`).
* Drop all Linux capabilities and add back only what's needed:
  ```yaml
  security_opt:
    - no-new-privileges:true
  cap_drop:
    - ALL
  ```
* Set memory and CPU limits on all containers.
* Use Docker secrets or a vault for sensitive configuration — not environment variables in `docker-compose.yml`.

---

## Testing Requirements

* All new code must include unit tests. Minimum **80% code coverage**.
* Use `jest` or `vitest` as the test runner.
* Integration tests must run against a Dockerised version of the app.
* Security-sensitive code (auth, input validation, access control) must have **100% branch coverage**.
* Run tests in CI before any merge to `main`.

### Running Tests

```bash
npm test              # Unit tests
npm run test:int      # Integration tests
npm run test:cov      # Coverage report
npm audit             # Dependency audit
```

---

## CI/CD Expectations

* All PRs must pass: linting, tests, `npm audit`, and Docker build.
* Container images must be scanned for vulnerabilities (e.g., Trivy, Snyk) before deployment.
* No direct pushes to `main` — all changes go through pull requests.
* Signed commits are encouraged.

---

## Useful Commands

| Task | Command |
|:---|:---|
| Install dependencies | `npm ci` |
| Run in development | `npm run dev` |
| Build for production | `npm run build` |
| Run tests | `npm test` |
| Lint code | `npm run lint` |
| Audit dependencies | `npm audit` |
| Build Docker image | `docker build -t app:latest .` |
| Run Docker container | `docker compose up` |

---

## Reminders for AI Agents

* When generating code, always follow the security rules above.
* Prefer well-known, actively maintained libraries over custom implementations.
* If unsure about a security implication, flag it with a `// SECURITY: review needed` comment.
* Never generate code that disables TLS verification, ignores certificate errors, or suppresses security warnings.
* Always consider the principle of least privilege when writing any code that touches the filesystem, network, or OS.
* When modifying the Dockerfile, re-verify that the non-root user constraint and multi-stage build are preserved.
