/**
 * Setup check: tests that everything the site depends on is in place, from the
 * configuration and keys to the GitHub settings and the live site. Run it with
 * the "Setup check" workflow (Actions → Setup check → Run workflow), which has
 * the secrets, or locally:
 *
 *   npm run setup-check                                   # no secrets: those checks are skipped
 *   npm run setup-check -- --key .keys/key-1.json         # also checks a local signing key
 *   GITHUB_TOKEN=$(gh auth token) npm run setup-check     # also reads admin-only GitHub settings
 *
 * The output is grouped into numbered parts, one file each in this directory:
 * check 4.2 is in 4-github-settings.ts. It exits with 1 if any check failed.
 */
import { appendFileSync } from 'node:fs';
import { SITE, SITE_URL } from '../../src/lib/config';
import type { CheckResult, Outcome, Part, Verdict } from './checks';
import { IN_ACTIONS, REPO } from './context';
import testsAndBuild from './1-tests-and-build';
import configuration from './2-configuration';
import signingKeys from './3-signing-keys';
import githubSettings from './4-github-settings';
import submissionsAndReports from './5-submissions-and-reports';
import submissionDryRun from './6-submission-dry-run';
import liveSite from './7-live-site';

const PARTS: Part[] = [testsAndBuild, configuration, signingKeys, githubSettings, submissionsAndReports, submissionDryRun, liveSite];

// --- Console output ---------------------------------------------------------------

const colour = process.stdout.isTTY || IN_ACTIONS;
const paint = (code: string) => (s: string) => (colour ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = paint('1');
const dim = paint('2');
const STYLE: Record<Outcome, { mark: string; paint: (s: string) => string; emoji: string; word: string }> = {
  pass: { mark: '✓', paint: paint('32'), emoji: '✅', word: 'passed' },
  warn: { mark: '!', paint: paint('33'), emoji: '⚠️', word: 'warning' },
  fail: { mark: '✗', paint: paint('31'), emoji: '❌', word: 'failed' },
  skip: { mark: '–', paint: dim, emoji: '⏭️', word: 'skipped' },
};
const WIDTH = 78;
const rule = (title: string, right = '') => {
  const fill = Math.max(3, WIDTH - title.length - right.length - 5);
  return `${bold(`━━ ${title} `)}${dim('━'.repeat(fill))} ${dim(right)}`;
};

function printResult(r: CheckResult) {
  const s = STYLE[r.outcome];
  console.log(`   ${s.paint(s.mark)} ${bold(`${r.id.padEnd(4)} ${r.name}`)}: ${r.outcome === 'skip' ? dim(r.detail) : r.detail}`);
  if (r.fix && r.outcome !== 'pass') console.log(`          ${s.paint('Fix:')} ${r.fix}`);
}

// --- Running the parts ------------------------------------------------------------

interface PartResult {
  part: Part;
  results: CheckResult[];
}

async function runPart(part: Part): Promise<PartResult> {
  const results: CheckResult[] = [];
  console.log(`\n${rule(`${part.number}. ${part.title}`, part.file)}`);
  console.log(`   ${dim(part.covers)}\n`);
  await part.run(async (id, name, test) => {
    if (!id.startsWith(`${part.number}.`)) throw new Error(`Check ${id} is in part ${part.number} (${part.file})`);
    let verdict: Verdict;
    try {
      verdict = await test();
    } catch (e) {
      verdict = { outcome: 'fail', detail: `The check itself failed: ${(e as Error).message}`, fix: `This may be a bug in ${part.file}.` };
    }
    const result = { id, name, ...verdict };
    results.push(result);
    printResult(result);
    return verdict;
  });
  return { part, results };
}

const count = (results: CheckResult[], outcome: Outcome) => results.filter((r) => r.outcome === outcome).length;

// --- Summary: console, GitHub job summary and annotations -----------------------------

function printSummary(all: PartResult[]) {
  const results = all.flatMap((p) => p.results);
  console.log(`\n${rule('Summary')}\n`);
  const head = `   ${'Part'.padEnd(36)}${['✓ passed', '! warnings', '✗ failed', '– skipped'].map((h) => h.padStart(11)).join('')}`;
  console.log(bold(head));
  for (const { part, results: rs } of [...all, { part: { number: 0, title: 'Total' } as Part, results }]) {
    const label = part.number ? `${part.number}. ${part.title}` : 'Total';
    const cells = (['pass', 'warn', 'fail', 'skip'] as Outcome[]).map((o) => {
      const n = count(rs, o);
      return (n ? STYLE[o].paint : dim)(String(n).padStart(11));
    });
    console.log(`   ${part.number ? label.padEnd(36) : bold(label.padEnd(36))}${cells.join('')}`);
  }
  for (const outcome of ['fail', 'warn'] as Outcome[]) {
    const list = results.filter((r) => r.outcome === outcome);
    if (!list.length) continue;
    console.log(`\n   ${bold(outcome === 'fail' ? 'Fix these first:' : 'Warnings (needed before launch, or worth a look):')}`);
    for (const r of list) {
      console.log(`   ${STYLE[outcome].paint(STYLE[outcome].mark)} ${bold(r.id)} ${r.name}: ${r.detail}`);
      if (r.fix) console.log(`        ${STYLE[outcome].paint('Fix:')} ${r.fix}`);
    }
  }
  const failed = count(results, 'fail');
  const warned = count(results, 'warn');
  console.log(
    '\n   ' +
      (failed
        ? STYLE.fail.paint(bold(`NOT READY: ${failed} check${failed === 1 ? '' : 's'} failed.`))
        : STYLE.pass.paint(bold(`READY${warned ? `, with ${warned} warning${warned === 1 ? '' : 's'}` : ''}.`))),
  );
}

/** The job summary shown on the workflow run's page. */
function markdownSummary(all: PartResult[]): string {
  const results = all.flatMap((p) => p.results);
  const failed = count(results, 'fail');
  const warned = count(results, 'warn');
  const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const server = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
  const sha = process.env.GITHUB_SHA ?? SITE.repository.branch;
  const fileLink = (file: string) => `[\`${file}\`](${server}/${REPO}/blob/${sha}/${file})`;
  const line = (r: CheckResult) => `${STYLE[r.outcome].emoji} **${r.id} ${cell(r.name)}**: ${cell(r.detail)}${r.fix ? `<br>**Fix:** ${cell(r.fix)}` : ''}`;

  const out = [
    `# Setup check: ${failed ? `❌ not ready, ${failed} failed` : '✅ ready'}${warned ? `, ${warned} warning${warned === 1 ? '' : 's'}` : ''}`,
    '',
    `Repository **${REPO}** · site ${SITE_URL} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
    'Each part is one file in `scripts/setup-check/`; check *n.m* is in part *n*’s file.',
    '',
    '| Part | ✅ Passed | ⚠️ Warnings | ❌ Failed | ⏭️ Skipped |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...all.map(({ part, results: rs }) => `| [${part.number}. ${part.title}](#${part.number}-${part.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}) | ${count(rs, 'pass')} | ${count(rs, 'warn')} | ${count(rs, 'fail')} | ${count(rs, 'skip')} |`),
    '',
  ];
  const problems = results.filter((r) => r.outcome === 'fail');
  const warnings = results.filter((r) => r.outcome === 'warn');
  if (problems.length) out.push('## Fix these first', '', ...problems.map((r) => `- ${line(r)}`), '');
  if (warnings.length) out.push('## Warnings', '', ...warnings.map((r) => `- ${line(r)}`), '');
  for (const { part, results: rs } of all) {
    out.push(`## ${part.number}. ${part.title}`, '', `${part.covers} Code: ${fileLink(part.file)}`, '', '| | Check | Result |', '| --- | --- | --- |');
    for (const r of rs) out.push(`| ${STYLE[r.outcome].emoji} | ${r.id} ${cell(r.name)} | ${cell(r.detail)}${r.fix && r.outcome !== 'pass' ? `<br>**Fix:** ${cell(r.fix)}` : ''} |`);
    out.push('');
  }
  return out.join('\n') + '\n';
}

/** Failures and warnings also appear as annotations at the top of the run's page. */
function annotations(all: PartResult[]) {
  const esc = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  for (const { part, results } of all) {
    for (const r of results) {
      if (r.outcome !== 'fail' && r.outcome !== 'warn') continue;
      const level = r.outcome === 'fail' ? 'error' : 'warning';
      console.log(`::${level} file=${part.file},title=${esc(`${r.id} ${r.name}`).replace(/[,:]/g, ' ')}::${esc(r.detail + (r.fix ? ` Fix: ${r.fix}` : ''))}`);
    }
  }
}

// --- Main -------------------------------------------------------------------------

console.log(bold(`${SITE.title}: setup check`));
console.log(`   Repository  ${REPO} (${SITE.repository.branch})`);
console.log(`   Site        ${SITE_URL}`);
console.log(`   Running     ${IN_ACTIONS ? 'in GitHub Actions, with the secrets of the "signing" environment' : 'locally: checks that need the secrets are skipped'}`);
console.log(dim(`\n   ${STYLE.pass.mark} passed   ${STYLE.warn.mark} warning   ${STYLE.fail.mark} failed   ${STYLE.skip.mark} skipped.  Check n.m is in part n's file, scripts/setup-check/n-*.ts.`));

const all: PartResult[] = [];
for (const part of PARTS) all.push(await runPart(part));
printSummary(all);
if (IN_ACTIONS) {
  annotations(all);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdownSummary(all));
}
process.exit(all.some((p) => p.results.some((r) => r.outcome === 'fail')) ? 1 : 0);
