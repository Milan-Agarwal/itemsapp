import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ─── AGENT DEFINITIONS ─────────────────────────────────────────────────────────
const AGENT_CATEGORIES = {
  "Intake & Routing": { color: "#0891b2", icon: "⟐" },
  "Triage & Classification": { color: "#7c3aed", icon: "◈" },
  "Resolution & Self-Service": { color: "#059669", icon: "◉" },
  "Incident & Major Event": { color: "#dc2626", icon: "⬡" },
  "Problem Management": { color: "#ea580c", icon: "◆" },
  "Knowledge Management": { color: "#2563eb", icon: "◇" },
  "Change & Release": { color: "#c026d3", icon: "⬢" },
  "Reporting & Governance": { color: "#ca8a04", icon: "△" },
};

const AGENTS = [
  { id: "ticket-routing", name: "Ticket Routing", category: "Intake & Routing", desc: "Intelligently route tickets using LLM analysis", status: "active", version: "1.2.0",
    pipelineStages: ["Ingest", "Classify", "Route", "Confirm", "Deliver"],
    testScenarios: [
      { name: "Network outage P1", input: { title: "Core switch failure - Building A", severity: "P1", service: "Network-Core", description: "Multiple VLANs down, affecting 200+ users" }},
      { name: "Password reset request", input: { title: "Unable to login to SAP", severity: "P3", service: "IAM", description: "User forgot password, needs reset for SAP ECC" }},
    ],
    guardrails: { maxLatencyMs: 5000, requireConfidence: 0.7, humanEscalation: true, maxRetries: 2 }},
  { id: "request-navigator", name: "Request Type Navigator", category: "Intake & Routing", desc: "Proposes best request category and input form based on user intent", status: "active", version: "1.0.0",
    pipelineStages: ["Parse Intent", "Match Category", "Select Form", "Validate", "Present"],
    testScenarios: [
      { name: "Software install request", input: { userMessage: "I need Tableau installed on my laptop", context: "analyst-role" }},
      { name: "Ambiguous request", input: { userMessage: "My computer is slow and I need more access", context: "developer-role" }},
    ],
    guardrails: { maxLatencyMs: 3000, requireConfidence: 0.6, humanEscalation: false, maxRetries: 1 }},
  { id: "access-verifier", name: "Access Request Verifier", category: "Intake & Routing", desc: "Checks access/role requests for completeness and policy validity", status: "active", version: "1.1.0",
    pipelineStages: ["Extract Request", "Check Policy", "Validate Completeness", "Risk Score", "Route/Reject"],
    testScenarios: [
      { name: "Valid admin access", input: { requestType: "role-grant", role: "db-admin", target: "prod-oracle-fin", justification: "Sprint 42 deployment", approverChain: ["mgr", "data-owner"] }},
      { name: "Incomplete request", input: { requestType: "role-grant", role: "root", target: "prod-k8s-cluster", justification: "", approverChain: [] }},
    ],
    guardrails: { maxLatencyMs: 4000, requireConfidence: 0.85, humanEscalation: true, maxRetries: 1 }},
  { id: "approval-routing", name: "Approval Discovery & Routing", category: "Intake & Routing", desc: "Identifies correct approvers dynamically and routes for authorization", status: "staging", version: "0.9.0",
    pipelineStages: ["Parse Request", "Lookup Ownership", "Build Approval Chain", "Route", "Track"],
    testScenarios: [
      { name: "Standard change approval", input: { changeType: "standard", service: "web-frontend", environment: "production" }},
    ],
    guardrails: { maxLatencyMs: 6000, requireConfidence: 0.8, humanEscalation: true, maxRetries: 3 }},
  { id: "self-resolution", name: "Guided Self-Resolution", category: "Resolution & Self-Service", desc: "Deflects repetitive cases with step-by-step self-service guidance", status: "active", version: "2.0.0",
    pipelineStages: ["Understand Issue", "Search KB", "Generate Steps", "Present Guide", "Track Outcome"],
    testScenarios: [
      { name: "VPN connectivity issue", input: { issue: "Cannot connect to VPN from home", userType: "standard", os: "Windows 11" }},
      { name: "Printer not working", input: { issue: "Network printer not responding", userType: "standard", os: "macOS" }},
    ],
    guardrails: { maxLatencyMs: 4000, requireConfidence: 0.75, humanEscalation: true, maxRetries: 2 }},
  { id: "case-summarizer", name: "Case Context Summarizer", category: "Triage & Classification", desc: "Summarizes full case history to speed up triage and handoffs", status: "active", version: "1.3.0",
    pipelineStages: ["Gather History", "Extract Key Events", "Identify Actors", "Synthesize", "Format Output"],
    testScenarios: [
      { name: "Long-running P2 incident", input: { caseId: "INC0042871", noteCount: 47, handoffs: 3, duration: "72h" }},
    ],
    guardrails: { maxLatencyMs: 8000, requireConfidence: 0.7, humanEscalation: false, maxRetries: 2 }},
  { id: "classification-assignment", name: "Classification & Assignment", category: "Triage & Classification", desc: "Classifies incoming cases and assigns to correct support group", status: "active", version: "1.4.0",
    pipelineStages: ["Ingest", "NLP Classify", "Match Group", "Check Capacity", "Assign"],
    testScenarios: [
      { name: "Database alert", input: { title: "Oracle RAC node eviction", service: "oracle-fin-prod", logSnippet: "ORA-29770: cluster interconnect timeout" }},
    ],
    guardrails: { maxLatencyMs: 5000, requireConfidence: 0.75, humanEscalation: true, maxRetries: 2 }},
  { id: "priority-estimator", name: "Priority & Impact Estimator", category: "Triage & Classification", desc: "Recommends urgency/priority by analyzing impact signals", status: "staging", version: "0.8.0",
    pipelineStages: ["Analyze Signals", "Check Business Context", "Estimate Impact", "Score Priority", "Recommend"],
    testScenarios: [
      { name: "Revenue system down", input: { service: "payment-gateway", affectedUsers: 15000, region: "NA", timeOfDay: "business-hours" }},
    ],
    guardrails: { maxLatencyMs: 3000, requireConfidence: 0.8, humanEscalation: true, maxRetries: 1 }},
  { id: "duplicate-detector", name: "Duplicate/Similarity Detector", category: "Triage & Classification", desc: "Detects duplicates, clusters similar cases, points to known fixes", status: "active", version: "1.1.0",
    pipelineStages: ["Vectorize", "Search Similar", "Cluster", "Link Known Fixes", "Report"],
    testScenarios: [
      { name: "Known recurring alert", input: { title: "Disk space critical /var/log", service: "app-server-pool-3", errorSig: "disk-space-var-log" }},
    ],
    guardrails: { maxLatencyMs: 4000, requireConfidence: 0.85, humanEscalation: false, maxRetries: 1 }},
  { id: "warroom-scribe", name: "Major Event War-Room Scribe", category: "Incident & Major Event", desc: "Maintains live timeline of events, decisions, and action items during severity situations", status: "active", version: "1.0.0",
    pipelineStages: ["Monitor Channel", "Extract Events", "Build Timeline", "Track Actions", "Publish"],
    testScenarios: [
      { name: "P1 bridge call", input: { eventType: "major-incident", channel: "#p1-bridge-2024-03", participants: 12, duration: "ongoing" }},
    ],
    guardrails: { maxLatencyMs: 10000, requireConfidence: 0.6, humanEscalation: false, maxRetries: 3 }},
  { id: "stakeholder-drafter", name: "Stakeholder Update Drafter", category: "Incident & Major Event", desc: "Drafts stakeholder-facing updates using standard templates", status: "active", version: "1.2.0",
    pipelineStages: ["Gather Context", "Select Template", "Draft Update", "Tone Check", "Deliver"],
    testScenarios: [
      { name: "Executive update - outage", input: { incidentId: "INC0050001", audience: "C-suite", updateType: "status", severity: "P1" }},
    ],
    guardrails: { maxLatencyMs: 6000, requireConfidence: 0.8, humanEscalation: true, maxRetries: 2 }},
  { id: "escalation-advisor", name: "Escalation & Paging Advisor", category: "Incident & Major Event", desc: "Recommends next escalation target matching expertise and ownership", status: "staging", version: "0.7.0",
    pipelineStages: ["Analyze Gap", "Search Experts", "Check Availability", "Rank Targets", "Recommend"],
    testScenarios: [
      { name: "Stale P1 needs escalation", input: { incidentId: "INC0050002", currentGroup: "L2-Network", staleDuration: "45min", attempts: 2 }},
    ],
    guardrails: { maxLatencyMs: 5000, requireConfidence: 0.7, humanEscalation: true, maxRetries: 2 }},
  { id: "shift-handoff", name: "Shift Handoff Builder", category: "Incident & Major Event", desc: "Produces structured shift-change handoff packets", status: "active", version: "1.0.0",
    pipelineStages: ["Collect Open Items", "Summarize Status", "Flag Risks", "Format Packet", "Deliver"],
    testScenarios: [
      { name: "Night shift handoff", input: { shiftEnd: "06:00 IST", team: "NOC-India", openIncidents: 7, pendingChanges: 2 }},
    ],
    guardrails: { maxLatencyMs: 8000, requireConfidence: 0.7, humanEscalation: false, maxRetries: 2 }},
  { id: "incident-to-problem", name: "Incident-to-Problem Candidate Finder", category: "Problem Management", desc: "Identifies recurring incidents and recommends problem records", status: "active", version: "1.1.0",
    pipelineStages: ["Scan Patterns", "Cluster Incidents", "Score Recurrence", "Draft Problem", "Recommend"],
    testScenarios: [
      { name: "Recurring memory leak", input: { pattern: "OOM kill on checkout-svc", occurrences: 12, timespan: "30d", services: ["checkout-svc", "cart-svc"] }},
    ],
    guardrails: { maxLatencyMs: 10000, requireConfidence: 0.75, humanEscalation: true, maxRetries: 2 }},
  { id: "problem-prioritizer", name: "Problem Backlog Prioritizer", category: "Problem Management", desc: "Ranks problem items by recurrence, risk, and business impact", status: "staging", version: "0.6.0",
    pipelineStages: ["Load Backlog", "Score Recurrence", "Score Risk", "Score Impact", "Rank & Report"],
    testScenarios: [
      { name: "Quarterly backlog review", input: { backlogSize: 34, timeframe: "Q1-2026", focusArea: "revenue-critical" }},
    ],
    guardrails: { maxLatencyMs: 15000, requireConfidence: 0.65, humanEscalation: false, maxRetries: 1 }},
  { id: "kb-draft-generator", name: "Knowledge Draft Generator", category: "Knowledge Management", desc: "Creates draft knowledge articles from resolved cases", status: "active", version: "1.3.0",
    pipelineStages: ["Extract Resolution", "Structure Article", "Add Metadata", "Quality Check", "Publish Draft"],
    testScenarios: [
      { name: "New KB from resolution", input: { incidentId: "INC0049500", resolutionNotes: "Cleared stale NFS mounts and restarted autofs", service: "file-services" }},
    ],
    guardrails: { maxLatencyMs: 10000, requireConfidence: 0.7, humanEscalation: true, maxRetries: 2 }},
  { id: "kb-quality-checker", name: "Knowledge Quality & Compliance Checker", category: "Knowledge Management", desc: "Validates knowledge drafts for completeness and policy alignment", status: "active", version: "1.0.0",
    pipelineStages: ["Parse Draft", "Check Sections", "Validate Clarity", "Policy Scan", "Score & Report"],
    testScenarios: [
      { name: "Incomplete KB article", input: { articleId: "KB0012345", sections: ["symptoms", "cause"], missingSections: ["resolution", "workaround"] }},
    ],
    guardrails: { maxLatencyMs: 6000, requireConfidence: 0.8, humanEscalation: false, maxRetries: 1 }},
  { id: "runbook-recommender", name: "Runbook/Playbook Recommender", category: "Knowledge Management", desc: "Suggests best operational runbook based on symptoms and context", status: "active", version: "2.1.0",
    pipelineStages: ["Detect", "Extract", "Retrieve", "Fuse", "AI Rank", "Deliver"],
    testScenarios: [
      { name: "Core switch failure", input: { title: "Core switch failure - Building A", severity: "P1", service: "Network-Core", errorMsg: "BGP peer down, multiple VLANs unreachable" }},
      { name: "Memory leak in production", input: { title: "OOM kills on checkout service", severity: "P2", service: "checkout-svc", errorMsg: "Container killed: OOMKilled, RSS exceeded 4Gi limit" }},
    ],
    guardrails: { maxLatencyMs: 15000, requireConfidence: 0.7, humanEscalation: true, maxRetries: 2 }},
  { id: "kb-gap-identifier", name: "Knowledge Gap Identifier", category: "Knowledge Management", desc: "Detects missing knowledge coverage for recurring issues", status: "staging", version: "0.5.0",
    pipelineStages: ["Scan Incidents", "Map to KB", "Find Gaps", "Score Priority", "Suggest Content"],
    testScenarios: [
      { name: "Monthly gap analysis", input: { timeframe: "last-30d", minOccurrences: 3, excludeServices: [] }},
    ],
    guardrails: { maxLatencyMs: 20000, requireConfidence: 0.6, humanEscalation: false, maxRetries: 1 }},
  { id: "change-template", name: "Change Record Template Builder", category: "Change & Release", desc: "Auto-drafts standard change records with pre-filled fields", status: "active", version: "1.0.0",
    pipelineStages: ["Parse Request", "Match Template", "Fill Fields", "Validate", "Create Draft"],
    testScenarios: [
      { name: "Standard patching change", input: { changeType: "standard", category: "patching", targets: ["web-pool-1", "web-pool-2"], window: "2026-03-15 02:00 UTC" }},
    ],
    guardrails: { maxLatencyMs: 5000, requireConfidence: 0.8, humanEscalation: false, maxRetries: 1 }},
  { id: "change-risk-scoring", name: "Change Risk Scoring", category: "Change & Release", desc: "Scores change risk using asset criticality and history patterns", status: "active", version: "1.2.0",
    pipelineStages: ["Load Change", "Assess Assets", "Check History", "Calculate Risk", "Report"],
    testScenarios: [
      { name: "High-risk prod change", input: { changeId: "CHG0078901", assets: ["payment-gateway", "fraud-engine"], environment: "production", hasRollback: true }},
    ],
    guardrails: { maxLatencyMs: 6000, requireConfidence: 0.8, humanEscalation: true, maxRetries: 2 }},
  { id: "release-notes", name: "Release Notes & Comms Generator", category: "Change & Release", desc: "Produces release notes from change metadata and deployment details", status: "staging", version: "0.8.0",
    pipelineStages: ["Gather Metadata", "Extract Changes", "Draft Notes", "Format Comms", "Publish"],
    testScenarios: [
      { name: "Sprint release notes", input: { releaseId: "R-2026-Q1-S6", services: ["checkout-svc", "inventory-svc"], jiraEpics: 4, deployDate: "2026-03-14" }},
    ],
    guardrails: { maxLatencyMs: 10000, requireConfidence: 0.7, humanEscalation: true, maxRetries: 2 }},
  { id: "governance-briefing", name: "Governance Briefing Pack Builder", category: "Reporting & Governance", desc: "Generates review packs including summary, risk heatmap, and key context", status: "staging", version: "0.4.0",
    pipelineStages: ["Collect Data", "Build Summary", "Generate Heatmap", "Compile Pack", "Format PDF"],
    testScenarios: [
      { name: "CAB weekly briefing", input: { meetingType: "CAB", date: "2026-03-14", pendingChanges: 12, highRiskCount: 3 }},
    ],
    guardrails: { maxLatencyMs: 20000, requireConfidence: 0.65, humanEscalation: false, maxRetries: 1 }},
  { id: "trend-reporter", name: "Operational Trend & Insights Reporter", category: "Reporting & Governance", desc: "Creates narrative trend reports from incident and operations data", status: "active", version: "1.0.0",
    pipelineStages: ["Query Data", "Detect Trends", "Analyze Patterns", "Draft Narrative", "Visualize"],
    testScenarios: [
      { name: "Monthly ops review", input: { timeframe: "2026-02", metrics: ["mttr", "incident-volume", "change-success-rate"], compareWith: "2026-01" }},
    ],
    guardrails: { maxLatencyMs: 25000, requireConfidence: 0.6, humanEscalation: false, maxRetries: 1 }},
  { id: "rca-portfolio", name: "Problem & RCA Portfolio Reporter", category: "Reporting & Governance", desc: "Tracks root-cause actions and prevention outcomes across portfolio", status: "staging", version: "0.3.0",
    pipelineStages: ["Load Problems", "Track Actions", "Measure Outcomes", "Score Prevention", "Report"],
    testScenarios: [
      { name: "Quarterly RCA report", input: { timeframe: "Q1-2026", openProblems: 18, closedProblems: 12, preventedIncidents: 45 }},
    ],
    guardrails: { maxLatencyMs: 20000, requireConfidence: 0.6, humanEscalation: false, maxRetries: 1 }},
];

// ─── PERFORMANCE DATA GENERATOR ─────────────────────────────────────────────────
const generatePerformanceData = (agent) => {
  const seed = agent.id.split("").reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const r = (min, max, offset = 0) => {
    const x = Math.sin(seed + offset) * 10000;
    return min + ((x - Math.floor(x)) * (max - min));
  };
  const invocations24h = Math.round(r(40, 600, 1));
  const avgLatency = Math.round(r(800, agent.guardrails.maxLatencyMs * 0.9, 2));
  const p95Latency = Math.round(avgLatency * r(1.4, 2.2, 3));
  const p99Latency = Math.round(p95Latency * r(1.2, 1.8, 4));
  const successRate = r(88, 99.8, 5);
  const avgConfidence = r(0.65, 0.95, 6);
  const humanEscRate = r(2, 18, 7);
  const llmCost24h = r(1.2, 28, 8);
  const tokenUsage = Math.round(r(50000, 800000, 9));
  const cacheHitRate = r(20, 55, 10);
  const slaCompliance = r(90, 100, 11);
  const hourlyLatency = Array.from({ length: 24 }, (_, i) => Math.round(avgLatency * r(0.6, 1.5, i + 20)));
  const hourlyVolume = Array.from({ length: 24 }, (_, i) => Math.round((invocations24h / 24) * r(0.2, 2.5, i + 50)));
  const hourlyErrors = Array.from({ length: 24 }, (_, i) => Math.round(r(0, 5, i + 80)));
  const stagePerf = agent.pipelineStages.map((s, i) => ({
    name: s,
    avgMs: Math.round(avgLatency / agent.pipelineStages.length * r(0.4, 1.8, i + 100)),
    errorRate: r(0, 4, i + 120),
  }));
  return {
    invocations24h, avgLatency, p95Latency, p99Latency, successRate, avgConfidence,
    humanEscRate, llmCost24h, tokenUsage, cacheHitRate, slaCompliance,
    hourlyLatency, hourlyVolume, hourlyErrors, stagePerf,
    lastError: (100 - successRate) > 3 ? { time: "14 min ago", msg: "LLM timeout after 30s — fusion fallback used" } : null,
    uptimeHours: Math.round(r(120, 720, 200)),
  };
};

// ─── SIMULATION ENGINE ──────────────────────────────────────────────────────────
const simulateAgent = (agent, scenario) => {
  return new Promise((resolve) => {
    const events = [];
    let totalMs = 0;
    agent.pipelineStages.forEach((stage) => {
      const ms = 200 + Math.random() * 800;
      totalMs += ms;
      events.push({ stage, status: "complete", durationMs: Math.round(ms), timestamp: totalMs });
    });
    const confidence = 0.6 + Math.random() * 0.35;
    const passed = confidence >= agent.guardrails.requireConfidence;
    resolve({
      agentId: agent.id, scenario: scenario.name, events, totalDurationMs: Math.round(totalMs),
      confidence: Math.round(confidence * 100) / 100, passed,
      guardrailsTriggered: !passed ? ["confidence-below-threshold"] : [],
      output: passed ? { recommendation: `Completed with ${Math.round(confidence * 100)}% confidence`, action: "auto-routed" } : { recommendation: "Escalated to human operator", action: "human-escalation" },
    });
  });
};

// ─── LIGHT THEME ────────────────────────────────────────────────────────────────
const t = {
  bg: "#f5f6fa", surface: "#ffffff", surfaceAlt: "#f8f9fc", border: "#e4e7ef", borderLight: "#eef0f6",
  text: "#1b1f30", textSec: "#495072", textMuted: "#8b93ab", textDim: "#b0b7cc",
  accent: "#4f6ef7", accentLight: "#eef1fe", accentBorder: "#c7d2fe",
  green: "#10b981", greenBg: "#ecfdf5", greenBd: "#a7f3d0",
  yellow: "#f59e0b", yellowBg: "#fffbeb", yellowBd: "#fde68a",
  red: "#ef4444", redBg: "#fef2f2", redBd: "#fecaca",
  mono: "'JetBrains Mono', 'SF Mono', monospace",
  sans: "'DM Sans', system-ui, sans-serif",
};

// ─── HEALTH SCORING ─────────────────────────────────────────────────────────────
const getHealthScore = (perf, guardrails) => {
  let s = 100;
  if (perf.successRate < 95) s -= (95 - perf.successRate) * 3;
  if (perf.avgLatency > guardrails.maxLatencyMs * 0.8) s -= 15;
  if (perf.p95Latency > guardrails.maxLatencyMs) s -= 20;
  if (perf.avgConfidence < guardrails.requireConfidence) s -= 25;
  if (perf.slaCompliance < 95) s -= (95 - perf.slaCompliance) * 2;
  return Math.max(0, Math.min(100, Math.round(s)));
};
const hCol = (s) => s >= 85 ? t.green : s >= 60 ? t.yellow : t.red;
const hBg = (s) => s >= 85 ? t.greenBg : s >= 60 ? t.yellowBg : t.redBg;
const hBd = (s) => s >= 85 ? t.greenBd : s >= 60 ? t.yellowBd : t.redBd;
const hLbl = (s) => s >= 85 ? "Healthy" : s >= 60 ? "Degraded" : "Critical";
const mCol = (v, g, w) => v >= g ? t.green : v >= w ? t.yellow : t.red;

// ─── MINI COMPONENTS ────────────────────────────────────────────────────────────
const Spark = ({ data, color, h = 32, w = 140 }) => {
  const max = Math.max(...data, 1), min = Math.min(...data, 0), range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(" ");
  return (<svg width={w} height={h} style={{ display: "block" }}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" /><circle cx={w} cy={parseFloat(pts.split(" ").pop().split(",")[1])} r="2.5" fill={color} /></svg>);
};
const MiniBar = ({ value, max, color, h = 6 }) => (<div style={{ width: "100%", height: h, background: t.borderLight, borderRadius: h / 2, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min((value / max) * 100, 100)}%`, background: color, borderRadius: h / 2, transition: "width 0.6s" }} /></div>);
const StatusBadge = ({ status }) => {
  const m = { active: { bg: t.greenBg, c: t.green, bd: t.greenBd, l: "ACTIVE" }, staging: { bg: t.yellowBg, c: t.yellow, bd: t.yellowBd, l: "STAGING" }, disabled: { bg: t.redBg, c: t.red, bd: t.redBd, l: "DISABLED" } }[status] || { bg: t.accentLight, c: t.accent, bd: t.accentBorder, l: "?" };
  return <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", background: m.bg, color: m.c, border: `1px solid ${m.bd}`, fontFamily: t.mono }}>{m.l}</span>;
};
const HealthBadge = ({ score }) => (<div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: hBg(score), border: `1px solid ${hBd(score)}` }}><div style={{ width: 7, height: 7, borderRadius: "50%", background: hCol(score), boxShadow: `0 0 6px ${hCol(score)}40` }} /><span style={{ fontSize: 11, fontWeight: 700, color: hCol(score), fontFamily: t.mono }}>{score}</span><span style={{ fontSize: 10, color: hCol(score), fontWeight: 500 }}>{hLbl(score)}</span></div>);

const PipelineViz = ({ stages, activeStage, completedStages }) => (<div style={{ display: "flex", alignItems: "center", gap: 3, margin: "10px 0" }}>{stages.map((stage, i) => { const done = completedStages?.includes(i), act = activeStage === i; return (<div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}><div style={{ width: "100%", height: 5, borderRadius: 3, background: done ? t.green : act ? t.accent : t.borderLight, transition: "background 0.4s", position: "relative" }}>{act && <div style={{ position: "absolute", inset: 0, borderRadius: 3, background: t.accent, animation: "pulse 1.5s ease-in-out infinite" }} />}</div><span style={{ fontSize: 9, color: done ? t.green : act ? t.accent : t.textDim, fontFamily: t.mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{stage}</span></div>); })}</div>);

const GuardrailEditor = ({ guardrails, onChange }) => (<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{Object.entries(guardrails).map(([k, v]) => (<div key={k} style={{ padding: "10px 12px", background: t.surfaceAlt, borderRadius: 8, border: `1px solid ${t.borderLight}` }}><div style={{ fontSize: 10, color: t.textMuted, marginBottom: 5, fontFamily: t.mono, textTransform: "uppercase", letterSpacing: "0.06em" }}>{k.replace(/([A-Z])/g, ' $1').trim()}</div>{typeof v === "boolean" ? (<button onClick={() => onChange({ ...guardrails, [k]: !v })} style={{ padding: "4px 12px", borderRadius: 5, border: `1px solid ${v ? t.greenBd : t.redBd}`, background: v ? t.greenBg : t.redBg, color: v ? t.green : t.red, fontSize: 11, cursor: "pointer", fontFamily: t.mono, fontWeight: 600 }}>{v ? "ON" : "OFF"}</button>) : (<input type="number" value={v} onChange={(e) => onChange({ ...guardrails, [k]: parseFloat(e.target.value) })} style={{ width: "100%", padding: "5px 8px", borderRadius: 5, border: `1px solid ${t.border}`, background: t.surface, color: t.text, fontSize: 12, fontFamily: t.mono, outline: "none" }} />)}</div>))}</div>);

const SimResult = ({ result }) => { if (!result) return null; return (<div style={{ background: t.surface, borderRadius: 10, border: `1px solid ${result.passed ? t.greenBd : t.redBd}`, padding: 16, marginTop: 10 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{result.scenario}</span><span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 5, background: result.passed ? t.greenBg : t.redBg, color: result.passed ? t.green : t.red, fontFamily: t.mono, fontWeight: 700, border: `1px solid ${result.passed ? t.greenBd : t.redBd}` }}>{result.passed ? "✓ PASS" : "✗ FAIL"}</span></div><div style={{ display: "flex", gap: 16, marginBottom: 10 }}>{[{ l: "LATENCY", v: `${result.totalDurationMs}ms`, c: result.totalDurationMs > 10000 ? t.yellow : t.text }, { l: "CONFIDENCE", v: `${(result.confidence * 100).toFixed(0)}%`, c: result.confidence >= 0.8 ? t.green : result.confidence >= 0.6 ? t.yellow : t.red }, { l: "ACTION", v: result.output.action, c: t.text }].map((m) => (<div key={m.l} style={{ flex: 1 }}><div style={{ fontSize: 10, color: t.textMuted, marginBottom: 2, fontFamily: t.mono }}>{m.l}</div><div style={{ fontSize: 15, fontWeight: 700, color: m.c, fontFamily: t.mono }}>{m.v}</div></div>))}</div><div style={{ borderTop: `1px solid ${t.borderLight}`, paddingTop: 8 }}>{result.events.map((ev, i) => (<div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 11, fontFamily: t.mono }}><span style={{ color: t.green }}>✓</span><span style={{ color: t.textSec, flex: 1 }}>{ev.stage}</span><span style={{ color: t.textMuted }}>{ev.durationMs}ms</span></div>))}</div>{result.guardrailsTriggered.length > 0 && (<div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 6, background: t.redBg, border: `1px solid ${t.redBd}`, fontSize: 11, color: t.red }}>⚠ Guardrails: {result.guardrailsTriggered.join(", ")}</div>)}</div>); };

// ─── MAIN APP ───────────────────────────────────────────────────────────────────
export default function ITSMAgentPlatform() {
  const [view, setView] = useState("monitor");
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [agentStates, setAgentStates] = useState(() => Object.fromEntries(AGENTS.map((a) => [a.id, { status: a.status, guardrails: { ...a.guardrails } }])));
  const [simResults, setSimResults] = useState({});
  const [runSim, setRunSim] = useState(null);
  const [simProg, setSimProg] = useState({ stage: -1, done: [] });
  const [batchResults, setBatchResults] = useState(null);
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => { const iv = setInterval(() => setTick((x) => x + 1), 8000); return () => clearInterval(iv); }, []);

  const agent = selectedAgent ? AGENTS.find((a) => a.id === selectedAgent) : null;
  const activeAgents = useMemo(() => AGENTS.filter((a) => agentStates[a.id]?.status === "active"), [agentStates]);

  const filteredAgents = AGENTS.filter((a) => {
    const mc = !selectedCategory || a.category === selectedCategory;
    const ms = !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.desc.toLowerCase().includes(search.toLowerCase());
    const mv = view !== "monitor" || agentStates[a.id]?.status === "active";
    return mc && ms && mv;
  });

  const runSimulation = useCallback(async (ag, sc) => {
    setRunSim(`${ag.id}-${sc.name}`);
    setSimProg({ stage: -1, done: [] });
    for (let i = 0; i < ag.pipelineStages.length; i++) {
      setSimProg((p) => ({ ...p, stage: i }));
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
      setSimProg((p) => ({ ...p, done: [...p.done, i] }));
    }
    const res = await simulateAgent(ag, sc);
    setSimResults((p) => ({ ...p, [`${ag.id}-${sc.name}`]: res }));
    setRunSim(null);
    setSimProg({ stage: -1, done: [] });
  }, []);

  const runBatch = useCallback(async () => {
    const res = { total: 0, passed: 0, failed: 0, byCategory: {}, agents: [] };
    for (const a of AGENTS) for (const s of a.testScenarios) {
      const r = await simulateAgent(a, s);
      res.total++; if (r.passed) res.passed++; else res.failed++;
      if (!res.byCategory[a.category]) res.byCategory[a.category] = { total: 0, passed: 0 };
      res.byCategory[a.category].total++; if (r.passed) res.byCategory[a.category].passed++;
      res.agents.push({ agent: a.name, scenario: s.name, ...r });
    }
    setBatchResults(res);
  }, []);

  const toggleStatus = (id) => setAgentStates((p) => ({ ...p, [id]: { ...p[id], status: p[id].status === "active" ? "disabled" : p[id].status === "disabled" ? "active" : p[id].status } }));

  const stats = { total: AGENTS.length, active: AGENTS.filter((a) => agentStates[a.id]?.status === "active").length, staging: AGENTS.filter((a) => agentStates[a.id]?.status === "staging").length };

  const overallPerfs = useMemo(() => activeAgents.map((a) => {
    const perf = generatePerformanceData(a);
    return { ...a, perf, health: getHealthScore(perf, agentStates[a.id].guardrails) };
  }), [activeAgents, tick]);

  const overallHealth = overallPerfs.length ? Math.round(overallPerfs.reduce((s, a) => s + a.health, 0) / overallPerfs.length) : 0;

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: t.sans, display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideR{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
        *{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:${t.border} transparent}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${t.border};border-radius:3px}
        input:focus,button:focus-visible{outline:2px solid ${t.accent};outline-offset:1px}
      `}</style>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <div style={{ width: 228, minHeight: "100vh", background: t.surface, borderRight: `1px solid ${t.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "18px 16px 16px", borderBottom: `1px solid ${t.borderLight}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#4f6ef7,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#fff" }}>⚡</div>
            <div><div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.04em" }}>AgentForge</div><div style={{ fontSize: 10, color: t.textMuted, fontFamily: t.mono }}>ITSM AI Platform</div></div>
          </div>
        </div>
        <div style={{ padding: "8px 8px 0" }}>
          {[{ id: "monitor", icon: "◎", l: "Performance Monitor" }, { id: "registry", icon: "⊞", l: "Agent Registry" }, { id: "simulate", icon: "▷", l: "Simulation Console" }, { id: "control", icon: "⊡", l: "Control Layer" }].map((it) => (
            <button key={it.id} onClick={() => { setView(it.id); setSelectedAgent(null); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", marginBottom: 1, borderRadius: 8, border: "none", cursor: "pointer", background: view === it.id ? t.accentLight : "transparent", color: view === it.id ? t.accent : t.textSec, fontSize: 12.5, fontWeight: view === it.id ? 600 : 400, fontFamily: "inherit", textAlign: "left", transition: "all .15s" }}>
              <span style={{ fontSize: 14, width: 18, textAlign: "center", opacity: view === it.id ? 1 : .55 }}>{it.icon}</span>{it.l}
            </button>
          ))}
        </div>
        <div style={{ padding: "12px 8px", borderTop: `1px solid ${t.borderLight}`, marginTop: 8 }}>
          <div style={{ fontSize: 9.5, color: t.textMuted, fontFamily: t.mono, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 5, padding: "0 5px" }}>Categories</div>
          <button onClick={() => setSelectedCategory(null)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", marginBottom: 1, borderRadius: 5, border: "none", cursor: "pointer", background: !selectedCategory ? t.accentLight : "transparent", color: !selectedCategory ? t.accent : t.textSec, fontSize: 11, fontFamily: "inherit", textAlign: "left" }}>All ({view === "monitor" ? activeAgents.length : AGENTS.length})</button>
          {Object.entries(AGENT_CATEGORIES).map(([cat, { color, icon }]) => {
            const n = (view === "monitor" ? activeAgents : AGENTS).filter((a) => a.category === cat).length;
            if (!n && view === "monitor") return null;
            return (<button key={cat} onClick={() => setSelectedCategory(cat)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", marginBottom: 1, borderRadius: 5, border: "none", cursor: "pointer", background: selectedCategory === cat ? `${color}0d` : "transparent", color: selectedCategory === cat ? color : t.textSec, fontSize: 11, fontFamily: "inherit", textAlign: "left" }}>
              <span style={{ fontSize: 9 }}>{icon}</span><span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span><span style={{ fontSize: 10, color: t.textMuted }}>{n}</span>
            </button>);
          })}
        </div>
        <div style={{ marginTop: "auto", padding: "10px 14px", borderTop: `1px solid ${t.borderLight}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: t.textMuted, fontFamily: t.mono }}><span style={{ color: t.green }}>{stats.active} active</span><span style={{ color: t.yellow }}>{stats.staging} staging</span><span>{stats.total} total</span></div>
        </div>
      </div>

      {/* ── MAIN ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: "auto", display: "flex" }}>

        {/* ── MONITOR OVERVIEW ────────────────────────────────────────────── */}
        {view === "monitor" && !selectedAgent && (
          <div style={{ flex: 1, overflow: "auto", padding: "22px 26px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <div><h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: "-0.03em" }}>Performance Monitor</h1><p style={{ margin: "3px 0 0", fontSize: 12.5, color: t.textMuted }}>Live health for {activeAgents.length} active agents — refreshes every 8s</p></div>
              <HealthBadge score={overallHealth} />
            </div>

            {/* Summary strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 22 }}>
              {[
                { l: "Active Agents", v: activeAgents.length, s: `of ${AGENTS.length}`, cl: t.accent },
                { l: "Avg Health", v: overallHealth, s: hLbl(overallHealth), cl: hCol(overallHealth) },
                { l: "Healthy", v: overallPerfs.filter((a) => a.health >= 85).length, s: "score ≥ 85", cl: t.green },
                { l: "Attention", v: overallPerfs.filter((a) => a.health < 85).length, s: "score < 85", cl: overallPerfs.some((a) => a.health < 60) ? t.red : t.yellow },
              ].map((m) => (
                <div key={m.l} style={{ padding: "16px 18px", background: t.surface, borderRadius: 12, border: `1px solid ${t.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.04)", animation: "fadeUp .3s ease" }}>
                  <div style={{ fontSize: 10.5, color: t.textMuted, marginBottom: 5, fontWeight: 500 }}>{m.l}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: m.cl, fontFamily: t.mono, lineHeight: 1 }}>{m.v}</div>
                  <div style={{ fontSize: 10.5, color: t.textDim, marginTop: 3 }}>{m.s}</div>
                </div>
              ))}
            </div>

            {/* Agent cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(330,1fr))", gap: 12 }}>
              {overallPerfs.filter((a) => !selectedCategory || a.category === selectedCategory).sort((a, b) => a.health - b.health).map((a, idx) => {
                const cm = AGENT_CATEGORIES[a.category];
                return (
                  <div key={a.id} onClick={() => setSelectedAgent(a.id)} style={{ padding: "16px 18px", background: t.surface, borderRadius: 12, border: `1px solid ${t.border}`, cursor: "pointer", transition: "all .2s", borderLeft: `4px solid ${hCol(a.health)}`, boxShadow: "0 1px 3px rgba(0,0,0,.03)", animation: `fadeUp .3s ease ${idx * .03}s both` }}
                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = `0 4px 16px ${hCol(a.health)}18`; e.currentTarget.style.borderColor = hCol(a.health); }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,.03)"; e.currentTarget.style.borderColor = t.border; e.currentTarget.style.borderLeftColor = hCol(a.health); }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
                      <div><div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}><span style={{ color: cm.color, fontSize: 10 }}>{cm.icon}</span><span style={{ fontSize: 13.5, fontWeight: 650 }}>{a.name}</span></div><span style={{ fontSize: 10, color: cm.color }}>{a.category}</span></div>
                      <HealthBadge score={a.health} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                      {[
                        { l: "LATENCY", v: `${a.perf.avgLatency}ms`, c: a.perf.avgLatency < a.guardrails.maxLatencyMs * .6 ? t.green : a.perf.avgLatency < a.guardrails.maxLatencyMs * .85 ? t.yellow : t.red },
                        { l: "SUCCESS", v: `${a.perf.successRate.toFixed(1)}%`, c: mCol(a.perf.successRate, 97, 93) },
                        { l: "CONFIDENCE", v: `${(a.perf.avgConfidence * 100).toFixed(0)}%`, c: mCol(a.perf.avgConfidence * 100, 80, 65) },
                      ].map((m) => (<div key={m.l}><div style={{ fontSize: 9, color: t.textMuted, fontFamily: t.mono, marginBottom: 1 }}>{m.l}</div><div style={{ fontSize: 14, fontWeight: 700, color: m.c, fontFamily: t.mono }}>{m.v}</div></div>))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <Spark data={a.perf.hourlyLatency} color={hCol(a.health)} w={150} h={26} />
                      <div style={{ textAlign: "right" }}><div style={{ fontSize: 10, color: t.textMuted }}>{a.perf.invocations24h} calls/24h</div><div style={{ fontSize: 10, color: t.textDim }}>${a.perf.llmCost24h.toFixed(2)}</div></div>
                    </div>
                    {a.perf.lastError && <div style={{ marginTop: 8, padding: "5px 9px", borderRadius: 5, background: t.redBg, border: `1px solid ${t.redBd}`, fontSize: 10, color: t.red }}>⚠ {a.perf.lastError.time}: {a.perf.lastError.msg}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── LIST PANEL ──────────────────────────────────────────────────── */}
        {(view !== "monitor" || selectedAgent) && (
          <div style={{ width: view === "registry" && !selectedAgent ? "100%" : 350, minWidth: 310, borderRight: `1px solid ${t.border}`, display: "flex", flexDirection: "column", flexShrink: 0, background: t.surface }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${t.borderLight}`, display: "flex", alignItems: "center", gap: 8 }}>
              {view === "monitor" && selectedAgent && <button onClick={() => setSelectedAgent(null)} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.textSec, fontSize: 11, cursor: "pointer" }}>←</button>}
              <input type="text" placeholder="Search agents..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1, padding: "7px 11px", borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg, color: t.text, fontSize: 12, fontFamily: "inherit", outline: "none" }} />
              {view === "simulate" && <button onClick={runBatch} style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${t.accentBorder}`, background: t.accentLight, color: t.accent, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: t.mono, whiteSpace: "nowrap" }}>▷ Run All</button>}
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "5px 7px" }}>
              {filteredAgents.map((a) => {
                const cm = AGENT_CATEGORIES[a.category]; const st = agentStates[a.id]; const sel = selectedAgent === a.id;
                return (<div key={a.id} onClick={() => setSelectedAgent(a.id)} style={{ padding: "11px 13px", marginBottom: 2, borderRadius: 10, cursor: "pointer", border: `1px solid ${sel ? cm.color + "40" : t.borderLight}`, background: sel ? `${cm.color}06` : t.surface, transition: "all .15s" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}><span style={{ color: cm.color, fontSize: 10 }}>{cm.icon}</span><span style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span></div><div style={{ fontSize: 10.5, color: t.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.desc}</div></div>
                    <StatusBadge status={st.status} />
                  </div>
                  {!selectedAgent && <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, paddingTop: 7, borderTop: `1px solid ${t.borderLight}` }}><span style={{ fontSize: 10, color: t.textDim, fontFamily: t.mono }}>v{a.version}</span><span style={{ fontSize: 10, color: t.textDim }}>{a.pipelineStages.length} stages</span><span style={{ fontSize: 10, color: cm.color, marginLeft: "auto" }}>{a.category}</span></div>}
                </div>);
              })}
            </div>
          </div>
        )}

        {/* ── DETAIL PANEL ────────────────────────────────────────────────── */}
        {selectedAgent && agent && (
          <div style={{ flex: 1, overflow: "auto", animation: "slideR .25s ease" }}>
            <div style={{ padding: "18px 22px", borderBottom: `1px solid ${t.borderLight}`, background: t.surface }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}><span style={{ color: AGENT_CATEGORIES[agent.category].color, fontSize: 15 }}>{AGENT_CATEGORIES[agent.category].icon}</span><h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em" }}>{agent.name}</h2><StatusBadge status={agentStates[agent.id].status} /></div>
              <p style={{ margin: "3px 0 0", fontSize: 12.5, color: t.textMuted }}>{agent.desc}</p>
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}><span style={{ fontSize: 11, color: t.textDim, fontFamily: t.mono }}>v{agent.version}</span><span style={{ fontSize: 11, color: AGENT_CATEGORIES[agent.category].color }}>{agent.category}</span></div>
            </div>
            <div style={{ padding: "12px 22px", borderBottom: `1px solid ${t.borderLight}`, background: t.surface }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: t.textMuted, fontFamily: t.mono, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 2 }}>Pipeline</div>
              <PipelineViz stages={agent.pipelineStages} activeStage={runSim?.startsWith(agent.id) ? simProg.stage : -1} completedStages={runSim?.startsWith(agent.id) ? simProg.done : agent.pipelineStages.map((_, i) => i)} />
            </div>

            {/* ── MONITOR DETAIL ─────────────────────────────────────────── */}
            {view === "monitor" && (() => {
              const perf = generatePerformanceData(agent);
              const health = getHealthScore(perf, agentStates[agent.id].guardrails);
              return (<div style={{ padding: "18px 22px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}><h3 style={{ margin: 0, fontSize: 14, fontWeight: 650 }}>Agent Health</h3><HealthBadge score={health} /></div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 18 }}>
                  {[
                    { l: "Invocations (24h)", v: perf.invocations24h.toLocaleString(), c: t.accent },
                    { l: "Avg Latency", v: `${perf.avgLatency}ms`, c: perf.avgLatency < agent.guardrails.maxLatencyMs * .6 ? t.green : perf.avgLatency < agent.guardrails.maxLatencyMs * .85 ? t.yellow : t.red },
                    { l: "P95 Latency", v: `${perf.p95Latency}ms`, c: perf.p95Latency < agent.guardrails.maxLatencyMs ? t.green : t.red },
                    { l: "Success Rate", v: `${perf.successRate.toFixed(1)}%`, c: mCol(perf.successRate, 97, 93) },
                    { l: "Avg Confidence", v: `${(perf.avgConfidence * 100).toFixed(0)}%`, c: mCol(perf.avgConfidence * 100, 80, 65) },
                    { l: "SLA Compliance", v: `${perf.slaCompliance.toFixed(1)}%`, c: mCol(perf.slaCompliance, 97, 93) },
                    { l: "Human Escalation", v: `${perf.humanEscRate.toFixed(1)}%`, c: perf.humanEscRate < 10 ? t.green : perf.humanEscRate < 15 ? t.yellow : t.red },
                    { l: "Cache Hit Rate", v: `${perf.cacheHitRate.toFixed(0)}%`, c: perf.cacheHitRate > 35 ? t.green : t.yellow },
                    { l: "LLM Cost (24h)", v: `$${perf.llmCost24h.toFixed(2)}`, c: perf.llmCost24h < 15 ? t.green : perf.llmCost24h < 25 ? t.yellow : t.red },
                  ].map((m) => (<div key={m.l} style={{ padding: "13px 15px", background: t.surfaceAlt, borderRadius: 10, border: `1px solid ${t.borderLight}` }}><div style={{ fontSize: 9.5, color: t.textMuted, marginBottom: 4, fontFamily: t.mono, textTransform: "uppercase", letterSpacing: ".04em" }}>{m.l}</div><div style={{ fontSize: 19, fontWeight: 800, color: m.c, fontFamily: t.mono, lineHeight: 1 }}>{m.v}</div></div>))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
                  {[{ l: "Latency (24h)", d: perf.hourlyLatency, c: t.accent }, { l: "Volume (24h)", d: perf.hourlyVolume, c: t.green }, { l: "Errors (24h)", d: perf.hourlyErrors, c: t.red }].map((ch) => (
                    <div key={ch.l} style={{ padding: 14, background: t.surface, borderRadius: 10, border: `1px solid ${t.border}` }}><div style={{ fontSize: 9.5, color: t.textMuted, marginBottom: 6, fontFamily: t.mono, textTransform: "uppercase", letterSpacing: ".04em" }}>{ch.l}</div><Spark data={ch.d} color={ch.c} w={190} h={38} /><div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9.5, color: t.textDim, fontFamily: t.mono }}><span>24h ago</span><span>now</span></div></div>
                  ))}
                </div>

                <h4 style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 600, color: t.textSec }}>Stage Performance</h4>
                <div style={{ background: t.surface, borderRadius: 10, border: `1px solid ${t.border}`, overflow: "hidden", marginBottom: 18 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 90px 70px 1fr", padding: "7px 15px", background: t.surfaceAlt, borderBottom: `1px solid ${t.borderLight}`, fontSize: 9.5, color: t.textMuted, fontFamily: t.mono, textTransform: "uppercase", letterSpacing: ".04em" }}><span>Stage</span><span>Avg Ms</span><span>Err %</span><span>Health</span></div>
                  {perf.stagePerf.map((s, i) => { const sc = s.errorRate < 1 ? t.green : s.errorRate < 3 ? t.yellow : t.red; return (<div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 90px 70px 1fr", padding: "9px 15px", borderBottom: `1px solid ${t.borderLight}`, alignItems: "center", fontSize: 12 }}><span style={{ fontWeight: 500 }}>{s.name}</span><span style={{ fontFamily: t.mono, fontSize: 11, color: t.textSec }}>{s.avgMs}ms</span><span style={{ fontFamily: t.mono, fontSize: 11, color: sc }}>{s.errorRate.toFixed(1)}%</span><MiniBar value={100 - s.errorRate * 10} max={100} color={sc} /></div>); })}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ padding: 14, background: t.surfaceAlt, borderRadius: 10, border: `1px solid ${t.borderLight}` }}><div style={{ fontSize: 9.5, color: t.textMuted, marginBottom: 4, fontFamily: t.mono, textTransform: "uppercase" }}>Token Usage (24h)</div><div style={{ fontSize: 21, fontWeight: 800, fontFamily: t.mono }}>{(perf.tokenUsage / 1000).toFixed(0)}k</div><div style={{ fontSize: 10, color: t.textDim, marginTop: 1 }}>tokens consumed</div></div>
                  <div style={{ padding: 14, background: t.surfaceAlt, borderRadius: 10, border: `1px solid ${t.borderLight}` }}><div style={{ fontSize: 9.5, color: t.textMuted, marginBottom: 4, fontFamily: t.mono, textTransform: "uppercase" }}>Uptime</div><div style={{ fontSize: 21, fontWeight: 800, fontFamily: t.mono, color: t.green }}>{perf.uptimeHours}h</div><div style={{ fontSize: 10, color: t.textDim, marginTop: 1 }}>since last restart</div></div>
                </div>
                {perf.lastError && <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: t.redBg, border: `1px solid ${t.redBd}`, fontSize: 11.5, color: t.red }}><strong>Last Error</strong> — {perf.lastError.time}: {perf.lastError.msg}</div>}
              </div>);
            })()}

            {view === "registry" && (<div style={{ padding: "16px 22px" }}>
              <h3 style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: ".08em", fontFamily: t.mono }}>LangGraph State</h3>
              <pre style={{ background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 10, padding: 14, fontSize: 11, color: t.textSec, fontFamily: t.mono, lineHeight: 1.6, overflow: "auto" }}>{`class ${agent.name.replace(/[^a-zA-Z]/g,'')}State(TypedDict):
    request_id: str
    raw_payload: dict
${agent.pipelineStages.map((s,i)=>`    stage_${i}_${s.toLowerCase().replace(/[^a-z0-9]/g,'_')}_result: dict`).join('\n')}
    confidence: float
    recommendation: Optional[dict]
    guardrails_triggered: list[str]
    trace_events: list[dict]`}</pre>
              <h3 style={{ margin: "18px 0 10px", fontSize: 11, fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: ".08em", fontFamily: t.mono }}>Graph Definition</h3>
              <pre style={{ background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 10, padding: 14, fontSize: 11, color: t.textSec, fontFamily: t.mono, lineHeight: 1.6, overflow: "auto" }}>{`graph = StateGraph(${agent.name.replace(/[^a-zA-Z]/g,'')}State)
${agent.pipelineStages.map(s=>`graph.add_node("${s.toLowerCase().replace(/[^a-z0-9]/g,'_')}", ${s.toLowerCase().replace(/[^a-z0-9]/g,'_')}_node)`).join('\n')}
graph.set_entry_point("${agent.pipelineStages[0].toLowerCase().replace(/[^a-z0-9]/g,'_')}")
${agent.pipelineStages.slice(0,-1).map((s,i)=>{const c2=s.toLowerCase().replace(/[^a-z0-9]/g,'_'),n=agent.pipelineStages[i+1].toLowerCase().replace(/[^a-z0-9]/g,'_');return`graph.add_edge("${c2}","${n}")`}).join('\n')}
graph.add_edge("${agent.pipelineStages.at(-1).toLowerCase().replace(/[^a-z0-9]/g,'_')}",END)
pipeline = graph.compile(checkpointer=PostgresSaver.from_conn_string(DATABASE_URL))`}</pre>
            </div>)}

            {view === "simulate" && (<div style={{ padding: "16px 22px" }}>
              <h3 style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: ".08em", fontFamily: t.mono }}>Test Scenarios</h3>
              {agent.testScenarios.map((sc, i) => (<div key={i} style={{ marginBottom: 16, animation: `fadeUp .3s ease ${i*.1}s both` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{sc.name}</span><button onClick={() => runSimulation(agent, sc)} disabled={runSim !== null} style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${t.accentBorder}`, background: runSim === `${agent.id}-${sc.name}` ? t.accent : t.accentLight, color: runSim === `${agent.id}-${sc.name}` ? "#fff" : t.accent, fontSize: 11, fontWeight: 600, cursor: runSim ? "not-allowed" : "pointer", fontFamily: t.mono, opacity: runSim && runSim !== `${agent.id}-${sc.name}` ? .4 : 1 }}>{runSim === `${agent.id}-${sc.name}` ? "Running..." : "▷ Run"}</button></div>
                <pre style={{ background: t.surfaceAlt, border: `1px solid ${t.borderLight}`, borderRadius: 8, padding: 10, fontSize: 11, color: t.textSec, fontFamily: t.mono, lineHeight: 1.5, overflow: "auto", margin: 0 }}>{JSON.stringify(sc.input, null, 2)}</pre>
                <SimResult result={simResults[`${agent.id}-${sc.name}`]} />
              </div>))}
            </div>)}

            {view === "control" && (<div style={{ padding: "16px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 11, fontWeight: 600, color: t.textMuted, textTransform: "uppercase", letterSpacing: ".08em", fontFamily: t.mono }}>Agent Control</h3>
                <button onClick={() => toggleStatus(agent.id)} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${agentStates[agent.id].status === "active" ? t.redBd : t.greenBd}`, background: agentStates[agent.id].status === "active" ? t.redBg : t.greenBg, color: agentStates[agent.id].status === "active" ? t.red : t.green, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{agentStates[agent.id].status === "active" ? "⏸ Disable" : "▶ Enable"}</button>
              </div>
              <h4 style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600, color: t.textSec }}>Guardrails</h4>
              <GuardrailEditor guardrails={agentStates[agent.id].guardrails} onChange={(g) => setAgentStates((p) => ({ ...p, [agent.id]: { ...p[agent.id], guardrails: g } }))} />
              <h4 style={{ margin: "18px 0 8px", fontSize: 12, fontWeight: 600, color: t.textSec }}>Deployment Manifest</h4>
              <pre style={{ background: t.surfaceAlt, border: `1px solid ${t.border}`, borderRadius: 10, padding: 14, fontSize: 11, color: t.textSec, fontFamily: t.mono, lineHeight: 1.6, overflow: "auto" }}>{`apiVersion: agentforge/v1
kind: ITSMAgent
metadata:
  name: ${agent.id}
  version: ${agent.version}
spec:
  pipeline: { framework: langgraph, stages: ${agent.pipelineStages.length}, checkpointing: postgresql }
  guardrails:
    maxLatencyMs: ${agentStates[agent.id].guardrails.maxLatencyMs}
    requireConfidence: ${agentStates[agent.id].guardrails.requireConfidence}
    humanEscalation: ${agentStates[agent.id].guardrails.humanEscalation}
    maxRetries: ${agentStates[agent.id].guardrails.maxRetries}
  integrations:
    servicenow: { enabled: true, bidirectional: true }
    slack: { enabled: true, channel: "#itsm-agents" }
    langfuse: { enabled: true, promptVersion: "v1.0" }`}</pre>
            </div>)}
          </div>
        )}

        {/* ── BATCH RESULTS ───────────────────────────────────────────────── */}
        {view === "simulate" && batchResults && !selectedAgent && (
          <div style={{ flex: 1, overflow: "auto", padding: "18px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}><h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Batch Results</h2><button onClick={() => setBatchResults(null)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${t.border}`, background: t.surfaceAlt, color: t.textSec, fontSize: 11, cursor: "pointer" }}>Dismiss</button></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 18 }}>
              {[{ l: "Total", v: batchResults.total, c: t.accent }, { l: "Passed", v: batchResults.passed, c: t.green }, { l: "Failed", v: batchResults.failed, c: t.red }].map((m) => (<div key={m.l} style={{ padding: 14, background: t.surface, borderRadius: 10, border: `1px solid ${t.border}`, textAlign: "center" }}><div style={{ fontSize: 26, fontWeight: 800, color: m.c, fontFamily: t.mono }}>{m.v}</div><div style={{ fontSize: 11, color: t.textMuted }}>{m.l}</div></div>))}
            </div>
            <div style={{ borderRadius: 10, border: `1px solid ${t.border}`, overflow: "hidden", background: t.surface }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 75px 75px 55px", padding: "7px 13px", background: t.surfaceAlt, borderBottom: `1px solid ${t.borderLight}`, fontSize: 9.5, color: t.textMuted, fontFamily: t.mono, textTransform: "uppercase" }}><span>Agent</span><span>Scenario</span><span>Latency</span><span>Conf.</span><span>Result</span></div>
              {batchResults.agents.map((r, i) => (<div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 2fr 75px 75px 55px", padding: "7px 13px", borderBottom: `1px solid ${t.borderLight}`, fontSize: 11, alignItems: "center" }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.agent}</span><span style={{ color: t.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.scenario}</span><span style={{ fontFamily: t.mono, color: t.textSec }}>{r.totalDurationMs}ms</span><span style={{ fontFamily: t.mono, color: r.confidence >= .8 ? t.green : r.confidence >= .6 ? t.yellow : t.red }}>{(r.confidence*100).toFixed(0)}%</span><span style={{ fontSize: 10, fontWeight: 700, color: r.passed ? t.green : t.red }}>{r.passed ? "PASS" : "FAIL"}</span></div>))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
