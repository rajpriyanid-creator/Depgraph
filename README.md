# ⚡ DepGraph — Dependency Intelligence Platform

A graph-powered dependency analysis tool built on Neo4j. DepGraph scans your project's dependency tree, stores it as a rich knowledge graph, and surfaces actionable insights: vulnerabilities, license risks, zombie packages, duplicates, and package health scores.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
- [Web UI](#web-ui)
- [Policy Rules](#policy-rules)
- [CI/CD Integration](#cicd-integration)
- [SBOM Export](#sbom-export)
- [Development](#development)
- [Configuration](#configuration)
- [Deploy to Render (Free)](#deploy-to-render-free)


---

## Features

| Feature | Description |
|---|---|
| 🕸 **Graph-powered** | Full dependency tree stored in Neo4j — traverse any depth in milliseconds |
| 🎮 **Interactive 3D Graph** | High-performance, GPU-accelerated **3D WebGL** rendering (Three.js) with smooth zoom/rotate/pan controls & high-resolution typography |
| 🚨 **Vulnerability paths** | Shortest/all paths from your code to a CVE, via OSV and GitHub Advisories |
| 🛠 **Security Fix Advisor** | Auto-corrects missing, empty (`""`), or wildcard version declarations in `package.json` using active DB resolution & node_modules fallbacks |
| 💚 **Health scores** | Composite 0–100 score from recency, maintainer count, download trends |
| 🧟 **Zombie detection** | Finds declared deps never imported in source files |
| 🔁 **Duplicate finder** | Multiple versions of the same package — plus wasted bundle bytes |
| 🔄 **Cycle detection** | Circular dependency chains with suggested break points |
| 📋 **Policy engine** | Enforce security, license, and health rules via `.depgraph.yml` |
| 🔀 **PR diff** | See exactly which packages changed between branches |
| 📦 **SBOM export** | CycloneDX 1.6 and SPDX 2.3 compliant software bill of materials |
| 🌐 **Local web UI** | Premium interactive dashboard with dual 2D/3D visualization & detailed node inspector |

---

## Architecture

```
packages/
├── core/        # Engine: collection, normalization, enrichment, graph queries
├── cli/         # depgraph CLI (Commander.js)
└── ui/          # React + Vite web UI (react-force-graph-3d + Three.js)

docker/
└── docker-compose.yml    # Neo4j 5.x for local development

.github/
└── workflows/ci.yml      # Build, test, integration tests, self-scan
```

**Data flow:**

```
Project files  →  Reader  →  Normalizer  →  Neo4j  →  Enrichment  →  Analysis
(package.json)   (npm/py)   (NormalizedGraph)        (OSV/GH/npm)   (queries)
```

---

## Quick Start 

Get DepGraph up and running on your system in under 2 minutes:

### 1. Prerequisites

Ensure you have the following installed:
- **Node.js** ≥ 20.x
- **pnpm** ≥ 9 (or npm/yarn, but `pnpm` is recommended for monorepos)
- **Docker Desktop** (running for Neo4j database container)

### 2. Start the Neo4j Database

Launch the Neo4j database instance in the background using Docker Compose:

```bash
docker compose -f docker/docker-compose.yml up -d
# Neo4j Bolt: bolt://localhost:7687  (User: neo4j, Pass: depgraph)
# Neo4j UI:   http://localhost:7474
```

### 3. Install & Build DepGraph

Install dependencies and build the workspace:

```bash
# Clone the repository (if not already done)
git clone https://github.com/rajpriyanid-creator/Depgraph.git
cd Depgraph

# Install & compile
pnpm install
pnpm build
```

### 4. Scan a Project & Launch Web UI

To scan a project and explore it interactively in the Web UI:

```bash
# Start the DepGraph server
node packages/cli/dist/index.js serve
```

Once running, open **`http://localhost:3847`** in your browser. 
From the UI, you can:
1. Enter any local project path in the sidebar (e.g. your cloned directory or another project path) and click **Analyze Workspace**.
2. Switch to the **Graph** tab to experience the **3D WebGL interactive visualization** (rotate, drag, and touchpad zoom are fully optimized).
3. Check the **Vulnerabilities** tab and go to **Security Fix Advisor** to review and apply automated dependency version remediation suggestions.

---

## CLI Reference

### `depgraph scan [path]`

Reads the project manifest and lockfile, builds the graph in Neo4j, and (by default) runs vulnerability enrichment.

```bash
depgraph scan .                         # Auto-detect ecosystem
depgraph scan . --ecosystem npm         # Force npm
depgraph scan . --no-audit              # Skip CVE check
```

### `depgraph audit [path]`

Queries vulnerability paths from the graph and prints them grouped by severity.

```bash
depgraph audit .
depgraph audit . --format json          # Machine-readable output
```

Exit code is `1` if any critical vulnerabilities are found.

### `depgraph policy [path]`

Evaluates `.depgraph.yml` policy rules against the scanned graph.

```bash
depgraph policy .
```

Exit code is `1` if any blocking violations are found — useful for CI gates.

### `depgraph diff [base-branch]`

Compares the current branch's dependency tree to a base branch.

```bash
depgraph diff main
depgraph diff develop --verbose        # Show all transitive changes
```

### `depgraph serve`

Starts the local web UI at `http://localhost:3847`.

```bash
depgraph serve
depgraph serve --port 4000
```

### `depgraph export [type]`

Exports an SBOM.

```bash
depgraph export cyclonedx              # CycloneDX 1.6 (default)
depgraph export spdx                   # SPDX 2.3
depgraph export json                   # Raw JSON
depgraph export cyclonedx --output /tmp/sbom.cdx.json
```

### `depgraph fix [path]`

Auto-applies safe patch-level fixes. *(Full implementation coming soon.)*

```bash
depgraph fix .
depgraph fix . --dry-run
```

---

## Web UI

Run `depgraph serve` and open `http://localhost:3847`.

| Tab | Description |
|---|---|
| 🕸 Graph | Interactive force-directed dependency graph — click any node for details |
| 🚨 Vulnerabilities | Full CVE list with path chains and fix versions |
| 💚 Health | Per-package health scores with score bars |
| 🧟 Zombies | Unused packages with remove command |
| 🔁 Duplicates | Multi-version packages with wasted bytes |

**Graph controls:**
- Search by package name (top-left)
- Toggle dev dependencies
- Filter to vulnerable packages only
- Click any node → side panel with details, CVEs, and npm link

---

## Policy Rules

Create a `.depgraph.yml` in your project root:

```yaml
security:
  block_on_severity: critical   # Fail CI on critical CVEs
  warn_on_severity: high        # Warn on high CVEs
  max_vulnerability_age_days: 30

licenses:
  allowed:
    - MIT
    - Apache-2.0
    - ISC
    - BSD-2-Clause
    - BSD-3-Clause
  blocked:
    - GPL-2.0
    - GPL-3.0
    - AGPL-3.0
    - SSPL-1.0

health:
  min_health_score: 30          # Warn if any package scores below this
  block_abandoned_days: 365     # Warn if last publish > 1 year ago

supply_chain:
  typosquatting_check: true
  ownership_change_alert: true
```

---

## CI/CD Integration

### GitHub Actions — built-in workflow

The repo ships with a complete CI workflow in `.github/workflows/ci.yml` that:

1. Builds and tests on every push
2. Runs integration tests against a Neo4j service container
3. Self-scans the project on every PR and posts an SBOM artifact

### GitHub Actions — reusable action

Use the bundled action in your own workflows:

```yaml
jobs:
  depgraph:
    runs-on: ubuntu-latest
    services:
      neo4j:
        image: neo4j:5-community
        ports: ["7687:7687"]
        env:
          NEO4J_AUTH: neo4j/secret
        options: >-
          --health-cmd "wget --spider http://localhost:7474"
          --health-interval 15s
          --health-retries 10

    steps:
      - uses: actions/checkout@v4

      - uses: ./depgraph-action
        with:
          neo4j-uri: bolt://localhost:7687
          neo4j-password: secret
          fail-on-severity: critical
          export-sbom: true
```

---

## SBOM Export

DepGraph exports standards-compliant SBOMs for compliance and supply chain audits:

| Format | Spec | Use case |
|---|---|---|
| CycloneDX 1.6 | OWASP | NIST SSDF, CISA, EU Cyber Resilience Act |
| SPDX 2.3 | Linux Foundation | OpenChain, OSS compliance |
| JSON | — | Custom tooling |

```bash
depgraph export cyclonedx --output sbom.cdx.json
depgraph export spdx     --output sbom.spdx.json
```

---

## Development

```bash
# Install all workspace deps
pnpm install

# Start Neo4j
docker compose -f docker/docker-compose.yml up -d

# Build everything
pnpm build

# Watch mode (all packages)
pnpm dev

# Run unit tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint
```

### Project conventions

- All packages use TypeScript strict mode with `NodeNext` module resolution
- Tests use Vitest; unit tests have no external dependencies
- Integration tests (require Neo4j) live in `src/__tests__/integration/`
- CI runs unit tests unconditionally; integration tests use a Neo4j service container

---

## Configuration

All Neo4j connection settings can be set via environment variables:

| Variable | Default | Description |
|---|---|---|
| `NEO4J_URI` | `bolt://localhost:7687` | Bolt connection URI |
| `NEO4J_USERNAME` | `neo4j` | Database username |
| `NEO4J_PASSWORD` | `depgraph` | Database password |
| `GITHUB_TOKEN` | — | Optional: for GitHub Advisory enrichment |
| `PORT` | `3847` | Port for the web UI server |

Or set them in `.depgraph.yml`:

```yaml
# Note: prefer env vars for credentials — don't commit passwords
neo4j:
  uri: bolt://my-neo4j-host:7687
```

---

## Deploy to Render (Free)

You can host the DepGraph Web Dashboard and API on Render's free tier by connecting it to a free Neo4j database hosted on Neo4j AuraDB.

### 1. Create a Free Neo4j AuraDB Database
1. Go to the [Neo4j Aura Console](https://console.neo4j.io/) and sign up for a free account.
2. Create a new **AuraDB Free** instance.
3. Download the generated credentials file containing your **Connection URI** (starts with `neo4j+s://`), Username (`neo4j`), and Password.

### 2. Deploy to Render
1. Log in to [Render](https://render.com/).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub repository: `https://github.com/rajpriyanid-creator/Depgraph.git`.
4. Render will read the [`render.yaml`](./render.yaml) file automatically. If prompted to manually configure:
   * **Runtime:** `Node`
   * **Build Command:** `pnpm install && pnpm build`
   * **Start Command:** `node packages/cli/dist/index.js serve`
5. Under **Environment Variables**, add the following:
   * `NEO4J_URI` — Your AuraDB connection URI (e.g., `neo4j+s://a1b2c3d4.databases.neo4j.io`)
   * `NEO4J_USERNAME` — `neo4j`
   * `NEO4J_PASSWORD` — Your AuraDB password
   * `NODE_VERSION` — `20`
6. Click **Deploy Web Service**. Render will build the workspace and start the server. You will receive a free public URL (e.g., `https://depgraph.onrender.com`).

### 3. Keep Render Awake (Prevent Inactivity Sleep)
Render's free tier automatically suspends (spins down) web services after 15 minutes of inactivity. When a new request arrives, it takes about 50–100 seconds to spin back up. 

To keep your service active and avoid spin-down:
* **Option A: GitHub Actions (Recommended & Built-in)**
  1. Open the file [`.github/workflows/keep-awake.yml`](./.github/workflows/keep-awake.yml) in this repository.
  2. Change the placeholder URL (`https://depgraph.onrender.com/api/projects`) to your actual Render URL.
  3. Commit and push the changes. The workflow will run automatically every 10 minutes on GitHub's servers to keep your app awake.
* **Option B: Free External Pingers**
  1. Register for a free account at [Cron-Job.org](https://cron-job.org/) or [UptimeRobot](https://uptimerobot.com/).
  2. Create a new HTTP monitor pointing to your Render app URL.
  3. Set the check interval to **10 minutes**.

---

## Supported Ecosystems

| Ecosystem | Manifest | Lockfile | Transitive | Notes |
|---|---|---|---|---|
| npm | `package.json` | `package-lock.json` v2/v3, `pnpm-lock.yaml` | ✅ | Full graph + scoped packages |
| Python | `pyproject.toml` | `poetry.lock`, `Pipfile.lock`, `requirements.txt` | ✅ (poetry) | |
| Rust | `Cargo.toml` | `Cargo.lock` | ✅ | |
| Java | `pom.xml` | — | ❌ (direct only) | Maven BOM resolution coming |

---

## License

MIT © DepGraph Contributors
