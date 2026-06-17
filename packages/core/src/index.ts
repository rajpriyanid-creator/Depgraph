// Graph database
export { getDriver, closeDriver, runQuery, runReadQuery, runTransaction } from './graph/db.js';
export { initSchema } from './graph/schema.js';
export { GraphIngester } from './graph/ingester.js';
export type { NormalizedGraph } from './graph/ingester.js';

// Graph queries
export { findVulnerabilityPaths } from './graph/queries/vulnerability-paths.js';
export { detectCycles } from './graph/queries/cycle-detection.js';
export { findDuplicates } from './graph/queries/duplicate-finder.js';
export { findZombies } from './graph/queries/zombie-detector.js';
export type { VulnerabilityPath } from './graph/queries/vulnerability-paths.js';
export type { Cycle } from './graph/queries/cycle-detection.js';
export type { DuplicateGroup } from './graph/queries/duplicate-finder.js';
export type { Zombie } from './graph/queries/zombie-detector.js';

// Collection readers
export { NpmReader } from './collection/readers/npm.js';
export { PythonReader } from './collection/readers/python.js';
export { RustReader } from './collection/readers/rust.js';
export { JavaReader } from './collection/readers/java.js';
export { scanImports } from './collection/import-scanner.js';
export type { RawNpmData } from './collection/readers/npm.js';

// Normalization
export { normalizeNpm } from './normalization/normalizers/npm-normalizer.js';

// Enrichment
export { OSVClient } from './enrichment/osv-client.js';
export { fetchAdvisories, mergeAdvisories } from './enrichment/github-advisory.js';
export { VulnerabilityEnricher } from './enrichment/vulnerability-enricher.js';
export { classifyLicense, traceLicenseContamination } from './enrichment/license-classifier.js';
export { computeHealthScore } from './enrichment/health-scorer.js';
export type { HealthScore } from './enrichment/health-scorer.js';

// Analysis
export { evaluatePolicy, loadPolicy } from './analysis/policy-engine.js';
export { analyzeUpdate, buildUpdatePlan } from './analysis/update-advisor.js';
export { analyzeSupplyChain } from './analysis/supply-chain.js';
export type { Policy, PolicyResult, PolicyViolation } from './analysis/policy-engine.js';
export type { UpdateAnalysis, UpdatePlan, RiskLevel } from './analysis/update-advisor.js';
export type { SupplyChainResult } from './analysis/supply-chain.js';

// Models
export type {
  DependencyEdge,
  Version,
  Vulnerability,
  License,
  Scan,
} from './normalization/models/index.js';
export type { Package, PackageScope } from './normalization/models/Package.js';
export type { Project, Ecosystem } from './normalization/models/Project.js';
