# ⚡ DepGraph — Dependency Intelligence Platform

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Render-blue?style=for-the-badge&logo=render&color=1f6feb)](https://depgraph-ad8z.onrender.com)
[![CI Build](https://img.shields.io/badge/CI-Passing-brightgreen?style=for-the-badge&logo=github-actions)](https://github.com/rajpriyanid-creator/Depgraph/actions)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](https://github.com/rajpriyanid-creator/Depgraph/blob/main/LICENSE)

A graph-powered dependency analysis and security validation platform. DepGraph scans your project's manifests, resolves transitive relationships into a rich Neo4j knowledge graph, and surfaces real-time insights: security vulnerabilities, license compliance risks, unused "zombie" packages, duplicates, and package health scores.

👉 **Explore the Live Dashboard:** [https://depgraph-ad8z.onrender.com](https://depgraph-ad8z.onrender.com)

---

## 📋 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Quick Start (Local Setup)](#-quick-start-local-setup)
- [Cloud Deployment (Render & Neo4j AuraDB)](#-cloud-deployment-render--neo4j-auradb)
- [CLI Reference](#-cli-reference)
- [Policy Engine Configuration](#-policy-engine-configuration)
- [CI/CD Integration](#-cicd-integration)
- [SBOM Compliance Export](#-sbom-compliance-export)
- [Supported Ecosystems](#-supported-ecosystems)
- [Development Setup](#-development-setup)

---

## ✨ Features

* 🕸 **Graph-Powered Intelligence** — Traverses full dependency trees at scale in Neo4j to find deep transitive links instantly.
* 🎮 **Interactive 2D & 3D Visualizations** — GPU-accelerated **3D WebGL** rendering (Three.js) featuring damping, high-res typography, and high-sensitivity touchpad zoom.
* 🚨 **Vulnerability Path Tracing** — Shows shortest paths from your root project to transient vulnerabilities (OSV & GitHub Advisory database).
* 🛠 **Security Fix Advisor** — Automatically detects missing, empty, or wildcard declarations in `package.json` and proposes precise, secure version corrections.
* 💚 **Composite Health Scoring** — Rates packages (0–100) based on maintainer count, update recency, and download trends.
* 🧟 **Zombie Package Detection** — Analyzes source code imports to find declared dependencies that are never actually imported.
* 🔁 **Bundle Wasted Bytes** — Highlights duplicate imports and computes exact disk space overhead.
* 📋 **Declarative Policies** — Enforces security, license, and health quality gates via a `.depgraph.yml` file.

---

## 🏗 Architecture

```
packages/
├── core/        # Core analyzer, normalizers, and database connectors
├── cli/         # Command-line interface (depgraph)
└── ui/          # Vite + React web UI (Three.js WebGL visualization)

docker/
└── docker-compose.yml    # Local Neo4j community database container
```

```
Project Files  ➔  Ecosystem Reader  ➔  Graph Normalizer  ➔  Neo4j DB  ➔  Enrichers (OSV/npm)  ➔  UI Dashboard
```

---

## 🚀 Quick Start (Local Setup)

Get DepGraph running locally in under 3 minutes:

### 1. Prerequisites
* **Node.js** ≥ 20.x
* **pnpm** ≥ 9 (Recommended for workspace monorepos)
* **Docker Desktop** (For running local database)

### 2. Launch Neo4j Database
Start the database container in the background:
```bash
docker compose -f docker/docker-compose.yml up -d
# Bolt port: bolt://localhost:7687 (Default credentials: neo4j / depgraph)
```

### 3. Install & Build
```bash
# Clone and install dependencies
git clone https://github.com/rajpriyanid-creator/Depgraph.git
cd Depgraph
pnpm install

# Compile workspace
pnpm build
```

### 4. Start Server
Run the DepGraph local server:
```bash
node packages/cli/dist/index.js serve
```
Open **`http://localhost:3847`** in your browser. From here, you can input any project directory or repository URL to scan.

---

## ☁️ Cloud Deployment (Render & Neo4j AuraDB)

The project includes pre-configured deployment blueprints to deploy to **Render's Free Tier** connected to a free **Neo4j AuraDB** cloud database.

### 1. Create a Free Neo4j AuraDB Database
1. Create a free account at [Neo4j Aura Console](https://console.neo4j.io/).
2. Launch a free **AuraDB Free** instance.
3. Save the generated credentials file containing your **Connection URI** (`neo4j+s://...`), username (`neo4j`), and password.

### 2. Launch on Render
1. Log in to [Render](https://render.com/).
2. Create a new **Blueprint** service.
3. Connect your fork of the repository.
4. Render will parse the [`render.yaml`](./render.yaml) file automatically. When prompted, fill in these environment variables:
   * `NEO4J_URI` — Your AuraDB connection URI
   * `NEO4J_USERNAME` — `neo4j`
   * `NEO4J_PASSWORD` — Your AuraDB password
   * `NODE_VERSION` — `20`
5. Click **Apply**. Render will compile the workspaces and spin up your live dashboard.

### 3. Prevent Free Tier Sleep (Keep Alive)
Render's free tier spins down services after 15 minutes of inactivity. To ensure instant responses:
1. Open the [`.github/workflows/keep-awake.yml`](./.github/workflows/keep-awake.yml) file.
2. Edit the target URL from the default to your live Render endpoint: `https://depgraph-ad8z.onrender.com/api/projects`.
3. Push to your repository. A GitHub Action will ping your Render app every 10 minutes, keeping it awake.

---

## 💻 CLI Reference

### `depgraph scan [path]`
Ingests manifest and lockfile data, parses relationships, and populates Neo4j.
```bash
depgraph scan .                          # Scan current directory
depgraph scan /path/to/project           # Scan custom directory
depgraph scan . --no-audit               # Skip vulnerability checks
```

### `depgraph audit [path]`
Traverses the graph to verify vulnerability paths, outputting summaries by severity.
```bash
depgraph audit .
depgraph audit . --format json           # Export JSON report
```

### `depgraph policy [path]`
Evaluates graph nodes against policy rules defined in `.depgraph.yml`.
```bash
depgraph policy .
```

### `depgraph diff [base-branch]`
Compares dependencies in the current branch against a baseline branch.
```bash
depgraph diff main
```

### `depgraph export [type]`
Exports a compliance-ready SBOM report.
```bash
depgraph export cyclonedx --output sbom.json  # CycloneDX 1.6 (Default)
depgraph export spdx                          # SPDX 2.3
```

---

## 🛡 Policy Engine Configuration

Enforce project guidelines by committing a `.depgraph.yml` to your project root:
```yaml
security:
  block_on_severity: critical   # Fail checks on critical vulnerabilities
  warn_on_severity: high        # Warn on high vulnerabilities

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
  min_health_score: 40          # Target score threshold (0-100)
  block_abandoned_days: 365     # Flag dependencies unmaintained for >1 year
```

---

## 🚀 CI/CD Integration

### Reusable GitHub Action
Inject DepGraph checks into your workflows using the bundled GitHub Action:
```yaml
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

| Format | Specification | Standard Targets |
|---|---|---|
| **CycloneDX 1.6** | OWASP | NIST SSDF, CISA, EU CRA |
| **SPDX 2.3** | Linux Foundation | ISO/IEC 5230 OpenChain |

```bash
depgraph export cyclonedx --output sbom.cdx.json
```

---

## 🌐 Supported Ecosystems

| Ecosystem | Manifest File | Lockfile | Scoping |
|---|---|---|---|
| **npm / JS** | `package.json` | `package-lock.json`, `pnpm-lock.yaml` | ✅ Full Transitive |
| **Python** | `pyproject.toml` | `poetry.lock`, `Pipfile.lock` | ✅ Full Transitive |
| **Rust** | `Cargo.toml` | `Cargo.lock` | ✅ Full Transitive |
| **Java** | `pom.xml` | — | ⚠️ Direct Only |

---

## 🛠 Development Setup

Run watch modes and verify codebase formatting:
```bash
pnpm dev            # Watch mode compiling TS
pnpm test           # Run Vitest unit tests
pnpm typecheck      # Type check workspace
pnpm lint           # Run linter
```

---

## 📄 License

Distributed under the MIT License. See [LICENSE](https://github.com/rajpriyanid-creator/Depgraph/blob/main/LICENSE) for more information.
