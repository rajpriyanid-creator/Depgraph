# ⚡ DepGraph — Dependency Intelligence Platform

> **Graph-powered dependency analysis, security auditing, and package health scoring for Node.js projects.**

DepGraph resolves your entire dependency tree into a rich **Neo4j knowledge graph** and exposes real-time insights through an interactive web dashboard — vulnerabilities, zombie packages, version duplicates, health scores, and policy enforcement — all in one place.

---

## 🌐 Live Demo

**Try it now →** [https://depgraph-ad8z.onrender.com](https://depgraph-ad8z.onrender.com)

Scan any public GitHub repository or local project directly from the web UI. No installation required for the cloud version.

---

## ✨ What You Get

| Feature | Description |
|---|---|
| 🕸 **Interactive 3D/2D Graph** | GPU-accelerated WebGL visualization with zoom-responsive labels, pan/rotate controls, and click-to-inspect nodes |
| 🚨 **Vulnerability Path Tracing** | Shortest paths from root → transitive CVE using OSV + GitHub Advisory Database |
| 🛡 **Security Fix Advisor** | Proposes precise `package.json` bumps and overrides to resolve vulnerabilities |
| 💚 **Package Health Scores** | 0–100 composite score: maintainer count, update recency, download trends |
| 🧟 **Zombie Package Detection** | Finds declared dependencies never imported in source code |
| 🔁 **Duplicate Version Analysis** | Highlights conflicting versions wasting bundle bytes |
| 📋 **Policy Engine** | Declarative `.depgraph.yml` to enforce security, license, and health gates |
| 📦 **SBOM Export** | CycloneDX 1.6 and SPDX 2.3 compliance reports |
| 🤖 **CI/CD Integration** | Reusable GitHub Action with Neo4j service |

---

## 🏗 Architecture

```
packages/
├── core/    ── Ecosystem readers, normalizers, Neo4j connector, enrichers (OSV, npm)
├── cli/     ── CLI entrypoint (depgraph serve / scan / audit / diff / fix / export)
└── ui/      ── Vite + React dashboard (Three.js WebGL graph, panels, charts)

docker/
└── docker-compose.yml   ── Local Neo4j 5 community container
```

**Data pipeline:**
```
Repo / Local Dir
  → findPackageJsonDir()       (searches root + backend/, frontend/, client/, …)
  → Ecosystem Reader           (npm, Python, Rust, Java)
  → Graph Normalizer
  → Neo4j Ingestion
  → Enrichers (OSV, npm registry)
  → Web UI / CLI
```

> **Smart subdirectory detection** — DepGraph automatically searches `backend/`, `frontend/`, `client/`, `server/`, `app/`, `src/`, and all immediate child directories when `package.json` is not at the project root.

---

## 🚀 Quick Start (Local)

**Prerequisites:** Node.js ≥ 20, pnpm ≥ 9, Docker Desktop

### 1. Clone & Install

```bash
git clone https://github.com/rajpriyanid-creator/Depgraph.git
cd Depgraph
pnpm install
pnpm build
```

### 2. Start Neo4j

```bash
docker compose -f docker/docker-compose.yml up -d
# Bolt: bolt://localhost:7687  |  Credentials: neo4j / depgraph
```

### 3. Launch the Dashboard

```bash
node packages/cli/dist/index.js serve
# Opens automatically at http://localhost:3847
```

### 4. Scan Your First Project

Open **`http://localhost:3847`** and either:
- **Paste a GitHub URL** (e.g. `github.com/expressjs/express`) → click **Analyze Repo**
- **Enter a local path** (e.g. `C:\projects\my-app`) → click **Analyze Local**

DepGraph will clone/read the project, detect `package.json` (even inside `backend/` or `frontend/`), ingest the graph, and run vulnerability enrichment automatically.

---

## 🌐 Using the Dashboard

### 3D / 2D Graph View
- **Rotate** — Click + drag
- **Zoom** — Scroll wheel or pinch (touchpad)
- **Pan** — Right-click + drag
- **Labels** — Appear automatically when you zoom in; root/direct nodes always labelled
- **Click a node** — Opens the Package Details panel (version, scope, CVEs, health)
- **Search** — Filter visible nodes by name
- **Toggles** — Hide dev dependencies, show only vulnerable packages

### Vulnerability Panel
- Severity breakdown: Critical / High / Medium / Low
- Per-CVE dependency chain (root → transitive → vulnerable package)
- **Re-scan** button to refresh from OSV without rescanning the project
- **Security Fix Advisor** tab — one-click `package.json` patch generation

### Health Panel
- Click **Compute Health Scores** to fetch live npm registry data
- Packages rated: Healthy / Watch / Caution / Risky
- Filter by label, see per-package score bars and ring charts

### Zombies Panel
- Lists packages declared in `dependencies` but never imported in source
- Classifies: Definitely Unused / Script-only / Types-only / Possibly Unused
- Shows disk-space savings and a ready-to-run `npm uninstall` command

### Duplicates Panel
- Highlights packages with multiple resolved versions in the tree
- Shows exact version conflicts and affected transitive paths

---

## ☁️ Cloud Deployment (Render + Neo4j AuraDB)

### 1. Create a Free Neo4j AuraDB Instance

1. Sign up at [console.neo4j.io](https://console.neo4j.io/)
2. Create a free **AuraDB Free** instance
3. Save the **Connection URI** (`neo4j+s://…`), username, and password

### 2. Deploy to Render

1. Fork this repository
2. Log in to [render.com](https://render.com/) → **New Blueprint**
3. Connect your fork — Render auto-reads [`render.yaml`](./render.yaml)
4. Set environment variables when prompted:

   | Variable | Value |
   |---|---|
   | `NEO4J_URI` | Your AuraDB URI |
   | `NEO4J_USERNAME` | `neo4j` |
   | `NEO4J_PASSWORD` | Your AuraDB password |
   | `NODE_VERSION` | `20` |

5. Click **Apply** — Render builds and deploys your live dashboard

### 3. Keep Alive (Free Tier)

Render's free tier sleeps after 15 minutes of inactivity. To prevent this:

1. Open [`.github/workflows/keep-awake.yml`](./.github/workflows/keep-awake.yml)
2. Replace the URL with your Render endpoint
3. Push — the GitHub Action will ping your app every 10 minutes

---

## 💻 CLI Reference

```bash
# Start the web UI (auto-opens browser)
depgraph serve

# Scan a project into Neo4j
depgraph scan .
depgraph scan /path/to/project
depgraph scan . --no-audit

# Show vulnerability paths
depgraph audit .
depgraph audit . --format json

# Check policy rules (.depgraph.yml)
depgraph policy .

# Diff dependencies vs a base branch
depgraph diff main

# Export SBOM
depgraph export cyclonedx --output sbom.json
depgraph export spdx --output sbom.spdx.json

# Auto-apply safe version fixes
depgraph fix .
```

---

## 🛡 Policy Engine (`.depgraph.yml`)

Commit this file to enforce quality gates in CI:

```yaml
security:
  block_on_severity: critical     # Fail pipeline on critical CVEs
  warn_on_severity: high          # Warn on high CVEs

licenses:
  allowed:
    - MIT
    - Apache-2.0
    - ISC
    - BSD-3-Clause
  blocked:
    - GPL-3.0
    - AGPL-3.0

health:
  min_health_score: 40            # Minimum allowed health score (0–100)
  block_abandoned_days: 365       # Flag packages unmaintained >1 year
```

```bash
depgraph policy .   # exits 1 if any rule is violated
```

---

## 🤖 CI/CD Integration

```yaml
# .github/workflows/dependency-scan.yml
name: Dependency Scan
on: [push, pull_request]

jobs:
  scan:
    runs-on: ubuntu-latest
    services:
      neo4j:
        image: neo4j:5-community
        ports: ["7687:7687"]
        env:
          NEO4J_AUTH: neo4j/secret
    steps:
      - uses: actions/checkout@v4
      - uses: ./depgraph-action
        with:
          neo4j-uri: bolt://localhost:7687
          neo4j-password: secret
          fail-on-severity: critical
```

---

## 📦 SBOM Compliance Export

| Format | Spec | Compliance Standards |
|---|---|---|
| **CycloneDX 1.6** | OWASP | NIST SSDF, CISA, EU CRA |
| **SPDX 2.3** | Linux Foundation | ISO/IEC 5230 OpenChain |

---

## 🌐 Supported Ecosystems

| Ecosystem | Manifest | Lockfile | Depth |
|---|---|---|---|
| **npm / Node.js** | `package.json` | `package-lock.json`, `pnpm-lock.yaml` | Full transitive |
| **Python** | `pyproject.toml` | `poetry.lock`, `Pipfile.lock` | Full transitive |
| **Rust** | `Cargo.toml` | `Cargo.lock` | Full transitive |
| **Java (Maven)** | `pom.xml` | — | Direct only |

> All ecosystems support the **smart subdirectory detection** — no need to point DepGraph at the exact folder containing the manifest.

---

## 🛠 Development

```bash
pnpm dev          # Watch mode (all packages)
pnpm test         # Vitest unit tests
pnpm typecheck    # TypeScript type check
pnpm lint         # ESLint
pnpm build        # Production build
```

**Tech stack:** TypeScript · React · Vite · Three.js · react-force-graph · Neo4j · Express · tsup · Turbo

---

## 📄 License

MIT — see [LICENSE](https://github.com/rajpriyanid-creator/Depgraph/blob/main/LICENSE)
