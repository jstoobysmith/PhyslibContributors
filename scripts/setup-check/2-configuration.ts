/**
 * Part 2: the hand-edited files in config/ (site, sections, maintainers,
 * revocations) and .github/CODEOWNERS.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVIDENCE_KINDS, ISSUER_DID, MAINTAINERS, SECTION_IDS, SECTIONS, SITE, SITE_URL, type Revocation } from '../../src/lib/config';
import { readJson, ROOT } from '../lib/files';
import { definePart, fail, listing, pass, plural, skip, warn } from './checks';
import { github, IN_ACTIONS, REPO } from './context';

export default definePart({
  number: 2,
  title: 'Configuration',
  covers: 'The settings in config/ and the code owners in .github/CODEOWNERS.',
  file: import.meta.url,
  async run(check) {
    await check('2.1', 'Site address', () => {
      const url = new URL(SITE.siteUrl);
      if (url.protocol !== 'https:') return fail(`siteUrl (${SITE.siteUrl}) must start with https://.`, 'Fix siteUrl in config/site.json.');
      const expectedBase = url.pathname.replace(/\/?$/, '/');
      if (SITE.basePath !== expectedBase) {
        return fail(`basePath is "${SITE.basePath}", but siteUrl's path is "${expectedBase}".`, `Set basePath to "${expectedBase}" in config/site.json.`);
      }
      return pass(`${SITE_URL}, so the issuer is ${ISSUER_DID}.`);
    });

    await check('2.2', 'Repository', () => {
      const configured = `${SITE.repository.owner}/${SITE.repository.name}`;
      let actual: string | undefined = IN_ACTIONS ? REPO : undefined;
      if (!actual) {
        try {
          const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' }).trim();
          actual = remote.match(/github\.com[:/](.+?)(\.git)?$/)?.[1];
        } catch {
          /* no git remote */
        }
      }
      if (!actual) return skip(`config/site.json names ${configured}; there is no GitHub remote to compare it with.`);
      return actual.toLowerCase() === configured.toLowerCase()
        ? pass(`config/site.json names ${configured}, the repository this runs in.`)
        : fail(`config/site.json names ${configured}, but this is ${actual}.`, 'Set repository.owner and repository.name in config/site.json (and siteUrl, basePath).');
    });

    await check('2.3', 'Sections', () => {
      const ids = SECTIONS.map((s) => s.id);
      const problems: string[] = [];
      if (ids.join() !== SECTION_IDS.join()) problems.push(`the sections are ${ids.join(', ')}; the code expects ${SECTION_IDS.join(', ')}`);
      for (const s of SECTIONS) {
        if (!s.name || !s.reportName || !s.criteria?.length) problems.push(`${s.id} needs a name, reportName and criteria`);
        const unknown = (s.evidenceKinds ?? []).filter((k) => !(k in EVIDENCE_KINDS));
        if (unknown.length) problems.push(`${s.id} has unknown evidence kinds (${unknown.join(', ')})`);
        if (!existsSync(join(ROOT, 'public', 'badges', `${s.id}.svg`))) problems.push(`public/badges/${s.id}.svg is missing`);
      }
      return problems.length
        ? fail(`config/sections.json: ${problems.join('; ')}.`, 'Fix config/sections.json (and redraw badges with python3 scripts/draw-badges.py).')
        : pass(`${SECTIONS.map((s) => `${s.numeral}. ${s.name}`).join(', ')}; each has criteria and a badge.`);
    });

    await check('2.4', 'Maintainers', () => {
      const required = SITE.review.requiredApprovals;
      const names = MAINTAINERS.map((m) => m.github);
      if (MAINTAINERS.length < required) {
        return fail(
          `${plural(MAINTAINERS.length, 'maintainer')} listed, but each report needs ${required} approvals: nothing can be signed.`,
          'Add maintainers to config/maintainers.json, or lower review.requiredApprovals in config/site.json.',
        );
      }
      const noId = MAINTAINERS.filter((m) => m.id === undefined).map((m) => m.github);
      if (MAINTAINERS.length < required + 1) {
        return warn(
          `Only ${listing(names.map((n) => `@${n}`))} can approve. Reports on ${MAINTAINERS.length === 1 ? 'that maintainer’s' : 'a maintainer’s'} own work can never get ${required} independent approval(s).`,
          `List at least ${required + 1} maintainers in config/maintainers.json before launch (README: Before launch).`,
        );
      }
      if (noId.length) return warn(`${listing(noId)} ha${noId.length === 1 ? 's' : 've'} no numeric GitHub id.`, 'Add "id" (from https://api.github.com/users/<login>) so a renamed account cannot take over.');
      return pass(`${listing(names.map((n) => `@${n}`))}; ${plural(required, 'approval')} needed per report.`);
    });

    await check('2.5', 'Maintainer accounts', async () => {
      const problems: string[] = [];
      for (const m of MAINTAINERS) {
        const { status, data } = await github<{ id: number; login: string }>(`/users/${encodeURIComponent(m.github)}`);
        if (status === 404) problems.push(`@${m.github} does not exist on GitHub`);
        else if (!data) return skip(`Could not reach the GitHub API (HTTP ${status}).`);
        else if (m.id !== undefined && data.id !== m.id) problems.push(`@${m.github} has id ${data.id}, not ${m.id} as listed`);
      }
      return problems.length
        ? fail(`${problems.join('; ')}.`, 'Correct config/maintainers.json.')
        : pass(`Every listed maintainer is a GitHub account${MAINTAINERS.some((m) => m.id !== undefined) ? ' with the listed id' : ''}.`);
    });

    await check('2.6', 'Code owners', () => {
      const path = join(ROOT, '.github', 'CODEOWNERS');
      if (!existsSync(path)) return fail('.github/CODEOWNERS is missing, so changes to the signing code need no maintainer review.', 'Restore .github/CODEOWNERS.');
      const rules = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
      const covered = rules.map((l) => l.trim().split(/\s+/)[0]);
      const needed = ['/.github/', '/scripts/', '/src/lib/', '/config/'].filter((p) => !covered.includes(p));
      if (needed.length) return fail(`CODEOWNERS does not cover ${listing(needed)}.`, 'Add those paths to .github/CODEOWNERS.');
      const owners = [...new Set(rules.flatMap((l) => l.trim().split(/\s+/).slice(1)).map((o) => o.replace(/^@/, '')))];
      const notMaintainers = owners.filter((o) => !o.includes('/') && !MAINTAINERS.some((m) => m.github.toLowerCase() === o.toLowerCase()));
      return notMaintainers.length
        ? warn(`Code owners who are not listed maintainers: ${listing(notMaintainers)}.`, 'Make the code owners and config/maintainers.json agree.')
        : pass(`The signing code and configuration are owned by ${listing(owners.map((o) => `@${o}`))}.`);
    });

    await check('2.7', 'Approval rules', () => {
      const { requiredApprovals, conflictDeclaration } = SITE.review;
      if (!Number.isInteger(requiredApprovals) || requiredApprovals < 1) return fail(`review.requiredApprovals is ${requiredApprovals}; it must be 1 or more.`, 'Fix config/site.json.');
      if (!conflictDeclaration.trim()) return fail('review.conflictDeclaration is empty.', 'Set it in config/site.json, e.g. "no conflict of interest".');
      return pass(`${plural(requiredApprovals, 'approval')} per report, each saying “${conflictDeclaration}”.`);
    });

    await check('2.8', 'Revocation list', () => {
      const list = readJson<Revocation[]>(join(ROOT, 'config', 'revocations.json'));
      if (!Array.isArray(list) || list.some((r) => typeof r.id !== 'string')) {
        return fail('config/revocations.json must be a list of { "id": "<credential id>", ... }.', 'Fix config/revocations.json (README: Revoking a report).');
      }
      return pass(list.length ? `${plural(list.length, 'report')} revoked.` : 'No reports revoked.');
    });

    await check('2.9', 'Draft notice', () =>
      SITE.draft
        ? warn('The site shows a “Draft” watermark.', 'At launch, set "draft": false in config/site.json.')
        : pass('The site is not marked as a draft.'),
    );
  },
});
