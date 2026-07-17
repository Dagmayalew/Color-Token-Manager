import * as vscode from 'vscode';
import { getProjectSummary } from './projectRouting';
import { buildThemeAuditReport, type ThemeAuditReport } from './themeAudit';
import { readColors } from './colorFile';
import { globToRegExp } from './globUtils';
import { type AppColor } from './types';

type DashboardTokenUsage = {
  tokenPath: string;
  value: string;
  occurrences: number;
  heat: number;
};

export type DesignSystemHealthDashboard = {
  score: number;
  workflow: string;
  colorsFile?: string;
  themeFile?: string;
  themeProviderFile?: string;
  coverage: {
    colorsDefined: number;
    themeDefined: number;
    mappingCoverage: number;
    usageCoverage: number;
  };
  criticalIssues: string[];
  warnings: string[];
  tokens: DashboardTokenUsage[];
  audit: ThemeAuditReport;
  summaryNotes: string[];
  trend: string;
};

export async function buildDesignSystemHealthDashboard(
  contextUri?: vscode.Uri,
): Promise<DesignSystemHealthDashboard> {
  const summary = await getProjectSummary(contextUri);
  const activeFile = summary.colorsFile ?? summary.themeFile ?? summary.themeProviderFile;
  if (!activeFile) {
    throw new Error('No design token file was found. Run setup or open a workspace with colors/theme files.');
  }

  const audit = await buildThemeAuditReport(activeFile);
  const colors = await readColors(activeFile);
  const usage = await buildTokenUsage(colors, activeFile);
  const usedTokens = usage.filter((token) => token.occurrences > 0).length;
  const colorsDefined = summary.colorsFile ? colors.length : 0;
  const themeDefined = summary.themeFile ? colors.length : 0;
  const mappingCoverage = computeMappingCoverage(summary, audit);
  const usageCoverage = colors.length ? Math.round((usedTokens / colors.length) * 100) : 0;
  const score = computeHealthScore({ audit, mappingCoverage, usageCoverage, summary });

  return {
    score,
    workflow: summary.workflow,
    colorsFile: summary.colorsFile ? vscode.workspace.asRelativePath(summary.colorsFile) : undefined,
    themeFile: summary.themeFile ? vscode.workspace.asRelativePath(summary.themeFile) : undefined,
    themeProviderFile: summary.themeProviderFile
      ? vscode.workspace.asRelativePath(summary.themeProviderFile)
      : undefined,
    coverage: {
      colorsDefined,
      themeDefined,
      mappingCoverage,
      usageCoverage,
    },
    criticalIssues: getCriticalIssues(audit, mappingCoverage),
    warnings: getWarnings(audit, usageCoverage),
    tokens: usage.slice(0, 24),
    audit,
    summaryNotes: summary.notes,
    trend: buildTrendText(score, audit),
  };
}

export function buildDesignSystemHealthDashboardHtml(
  dashboard: DesignSystemHealthDashboard,
): string {
  const nonce = getNonce();
  const payload = JSON.stringify(dashboard).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Design System Health Dashboard</title>
  <style>
    body { margin: 0; padding: 24px; font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
    .shell { max-width: 1200px; margin: 0 auto; display: grid; gap: 16px; }
    header, .card { background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-panel-border); border-radius: 12px; padding: 16px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    .meta { color: var(--vscode-descriptionForeground); font-size: 13px; line-height: 1.5; }
    .hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; align-items: stretch; }
    .score { font-size: 48px; font-weight: 800; line-height: 1; }
    .score-label { color: var(--vscode-descriptionForeground); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
    .stat { padding: 12px; border: 1px solid var(--vscode-panel-border); border-radius: 10px; background: color-mix(in srgb, var(--vscode-editor-background) 85%, transparent); }
    .stat strong { display: block; font-size: 22px; margin-bottom: 4px; }
    .section-title { margin: 0 0 10px; font-size: 18px; }
    .issue { display: flex; gap: 8px; margin: 6px 0; }
    .badge { min-width: 72px; text-align: center; padding: 2px 8px; border-radius: 999px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 11px; height: fit-content; }
    .badge.critical { background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-errorForeground); }
    .badge.warn { background: var(--vscode-inputValidation-warningBackground); color: var(--vscode-editor-foreground); }
    .heatmap { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
    .token { border: 1px solid var(--vscode-panel-border); border-radius: 10px; padding: 10px; }
    .swatch { width: 18px; height: 18px; border-radius: 999px; border: 1px solid var(--vscode-panel-border); display: inline-block; vertical-align: middle; margin-right: 8px; }
    .muted { color: var(--vscode-descriptionForeground); }
    button, a.btn { display: inline-block; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; border-radius: 8px; padding: 8px 12px; text-decoration: none; cursor: pointer; font: inherit; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <h1>Design System Health Dashboard</h1>
      <div class="meta" id="overview"></div>
      <div class="row" style="margin-top:12px;">
        <button id="exportHtml">Export HTML</button>
        <button id="openReport">View Report</button>
      </div>
    </header>

    <section class="hero">
      <div class="card">
        <div class="score-label">Health Score</div>
        <div class="score" id="score">0</div>
        <div class="meta" id="trend"></div>
      </div>
      <div class="card">
        <div class="score-label">Workflow</div>
        <div class="meta" id="workflow"></div>
      </div>
      <div class="card">
        <div class="score-label">Coverage</div>
        <div class="meta" id="coverage"></div>
      </div>
      <div class="card">
        <div class="score-label">Top Risk</div>
        <div class="meta" id="topRisk"></div>
      </div>
    </section>

    <section class="card">
      <h2 class="section-title">Critical Issues</h2>
      <div id="issues"></div>
    </section>

    <section class="card">
      <h2 class="section-title">Token Heatmap</h2>
      <div class="heatmap" id="heatmap"></div>
    </section>

    <section class="card">
      <h2 class="section-title">Summary Notes</h2>
      <div id="notes" class="muted"></div>
    </section>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const dashboard = ${payload};

    const colors = dashboard.tokens.map((token) => token.value.toLowerCase());
    const overview = [];
    if (dashboard.colorsFile) overview.push('Colors: ' + dashboard.colorsFile);
    if (dashboard.themeFile) overview.push('Theme: ' + dashboard.themeFile);
    if (dashboard.themeProviderFile) overview.push('Provider: ' + dashboard.themeProviderFile);
    document.getElementById('overview').textContent = overview.join(' | ');
    document.getElementById('score').textContent = dashboard.score + '/100';
    document.getElementById('workflow').textContent = dashboard.workflow;
    document.getElementById('coverage').textContent =
      'Colors ' + dashboard.coverage.colorsDefined + ' | Theme ' + dashboard.coverage.themeDefined +
      ' | Mapping ' + dashboard.coverage.mappingCoverage + '% | Usage ' + dashboard.coverage.usageCoverage + '%';
    document.getElementById('trend').textContent = dashboard.trend;
    document.getElementById('topRisk').textContent = dashboard.criticalIssues[0] || 'No critical issues detected.';

    const issues = document.getElementById('issues');
    const issueItems = [...dashboard.criticalIssues.map((item) => ({ level: 'critical', text: item })), ...dashboard.warnings.map((item) => ({ level: 'warn', text: item }))];
    if (!issueItems.length) {
      issues.innerHTML = '<div class="muted">No major issues detected.</div>';
    } else {
      issues.innerHTML = issueItems.slice(0, 8).map((item) => '<div class="issue"><span class="badge ' + item.level + '">' + item.level + '</span><div>' + item.text + '</div></div>').join('');
    }

    const heatmap = document.getElementById('heatmap');
    if (!dashboard.tokens.length) {
      heatmap.innerHTML = '<div class="muted">No token usage detected yet.</div>';
    } else {
      heatmap.innerHTML = dashboard.tokens.map((token) => {
        const alpha = Math.min(0.18 + (token.heat / 100) * 0.7, 0.95);
        const swatch = '<span class="swatch" style="background: rgba(59,130,246,' + alpha.toFixed(2) + ');"></span>';
        return '<div class="token">' + swatch + '<strong>' + token.tokenPath + '</strong><div class="muted">' + token.occurrences + ' use(s)</div></div>';
      }).join('');
    }

    const notes = document.getElementById('notes');
    notes.innerHTML = dashboard.summaryNotes.length
      ? dashboard.summaryNotes.map((note) => '<div>• ' + note + '</div>').join('')
      : '<div>No extra notes.</div>';

    document.getElementById('openReport').addEventListener('click', () => {
      vscode.postMessage({ type: 'openReport' });
    });
    document.getElementById('exportHtml').addEventListener('click', () => {
      vscode.postMessage({ type: 'exportHtml' });
    });
  </script>
</body>
</html>`;
}

export function exportDesignSystemHealthHtml(dashboard: DesignSystemHealthDashboard): string {
  const sections = [
    `<h1>Design System Health Dashboard</h1>`,
    `<p>Score: ${dashboard.score}/100</p>`,
    `<p>Workflow: ${dashboard.workflow}</p>`,
    `<p>Coverage: colors ${dashboard.coverage.colorsDefined}, theme ${dashboard.coverage.themeDefined}, mapping ${dashboard.coverage.mappingCoverage}%, usage ${dashboard.coverage.usageCoverage}%</p>`,
    `<h2>Critical Issues</h2>`,
    dashboard.criticalIssues.length
      ? `<ul>${dashboard.criticalIssues.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : '<p>No major issues detected.</p>',
    `<h2>Warnings</h2>`,
    dashboard.warnings.length
      ? `<ul>${dashboard.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : '<p>No warnings.</p>',
    `<h2>Token Heatmap</h2>`,
    dashboard.tokens.length
      ? `<table border="1" cellspacing="0" cellpadding="6"><tr><th>Token</th><th>Uses</th><th>Value</th></tr>${dashboard.tokens
          .map((token) => `<tr><td>${escapeHtml(token.tokenPath)}</td><td>${token.occurrences}</td><td>${escapeHtml(token.value)}</td></tr>`)
          .join('')}</table>`
      : '<p>No token usage detected yet.</p>',
    `<h2>Summary Notes</h2>`,
    dashboard.summaryNotes.length
      ? `<ul>${dashboard.summaryNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>`
      : '<p>No extra notes.</p>',
  ];

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Design System Health Dashboard</title><style>body{font-family:Arial,sans-serif;padding:24px;line-height:1.5} table{border-collapse:collapse;max-width:100%} th,td{border:1px solid #ccc} h1,h2{margin-bottom:8px}</style></head><body>${sections.join('')}</body></html>`;
}

async function buildTokenUsage(colors: AppColor[], colorsFileUri: vscode.Uri): Promise<DashboardTokenUsage[]> {
  const files = await findProjectSourceFiles(colorsFileUri);
  const counts = new Map<string, number>();
  for (const fileUri of files) {
    const text = Buffer.from(await vscode.workspace.fs.readFile(fileUri)).toString('utf8');
    for (const color of colors) {
      const regex = new RegExp(`\\b${escapeRegExp(color.key)}\\b`, 'g');
      const matches = text.match(regex);
      if (matches?.length) {
        counts.set(color.key, (counts.get(color.key) ?? 0) + matches.length);
      }
    }
  }

  return colors
    .map((color) => {
      const occurrences = counts.get(color.key) ?? 0;
      return {
        tokenPath: color.key,
        value: color.value,
        occurrences,
        heat: Math.min(100, occurrences * 15 + (color.aliasOf ? 10 : 0)),
      };
    })
    .sort((a, b) => b.occurrences - a.occurrences);
}

function computeMappingCoverage(summary: Awaited<ReturnType<typeof getProjectSummary>>, audit: ThemeAuditReport): number {
  if (!summary.colorsFile || !summary.themeFile) {
    return summary.themeProviderFile ? 70 : 100;
  }
  const total = audit.themes.reduce((sum, theme) => sum + theme.tokenCount, 0);
  if (!total) {
    return 100;
  }
  const missing = audit.missingThemeCounterparts.length;
  return Math.max(0, Math.min(100, Math.round(((total - missing) / total) * 100)));
}

function computeHealthScore(args: {
  audit: ThemeAuditReport;
  mappingCoverage: number;
  usageCoverage: number;
  summary: Awaited<ReturnType<typeof getProjectSummary>>;
}): number {
  let score = 100;
  score -= Math.min(25, args.audit.contrastRisks.length * 8);
  score -= Math.min(20, args.audit.unused.length * 2);
  score -= Math.min(15, args.audit.duplicateValues.length * 3);
  score -= Math.min(20, (100 - args.mappingCoverage) * 0.4);
  score -= Math.min(10, (100 - args.usageCoverage) * 0.2);
  if (args.summary.themeProviderFile) {
    score += 2;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getCriticalIssues(audit: ThemeAuditReport, mappingCoverage: number): string[] {
  const issues: string[] = [];
  if (audit.contrastRisks.length) {
    issues.push(`${audit.contrastRisks.length} contrast risk(s) need attention.`);
  }
  if (mappingCoverage < 100) {
    issues.push(`Theme mapping coverage is ${mappingCoverage}%.`);
  }
  if (audit.missingThemeCounterparts.length) {
    issues.push(`${audit.missingThemeCounterparts.length} token(s) are missing theme counterparts.`);
  }
  if (audit.unused.length) {
    issues.push(`${audit.unused.length} unused token(s) can be removed.`);
  }
  return issues;
}

function getWarnings(audit: ThemeAuditReport, usageCoverage: number): string[] {
  const warnings: string[] = [];
  if (audit.aliases.length) warnings.push(`${audit.aliases.length} alias token(s) are present.`);
  if (audit.duplicateValues.length) warnings.push(`${audit.duplicateValues.length} duplicate value group(s) detected.`);
  if (usageCoverage < 70) warnings.push(`Usage coverage is ${usageCoverage}%; some tokens may be underused.`);
  return warnings;
}

function buildTrendText(score: number, audit: ThemeAuditReport): string {
  if (audit.contrastRisks.length) return `Trend: score pulled down by ${audit.contrastRisks.length} contrast issue(s).`;
  if (score >= 90) return 'Trend: strong health with minimal risk.';
  if (score >= 75) return 'Trend: healthy with a few areas to tighten.';
  return 'Trend: attention needed; governance is slipping.';
}

async function findProjectSourceFiles(colorsFileUri: vscode.Uri): Promise<vscode.Uri[]> {
  const configuredExcludes = vscode.workspace
    .getConfiguration('colorTokenManager')
    .get<string[]>('excludeGlobs', []);
  const files = await vscode.workspace.findFiles('**/*.{ts,tsx,js,jsx,css,scss,less,html,htm}', '{**/node_modules/**,**/dist/**,**/build/**,**/coverage/**,**/ios/**,**/android/**}');
  return files.filter((fileUri) => {
    if (fileUri.toString() === colorsFileUri.toString()) {
      return false;
    }
    const relativePath = vscode.workspace.asRelativePath(fileUri).replace(/\\/g, '/');
    return !configuredExcludes.some((glob) => globToRegExp(glob).test(relativePath));
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}
