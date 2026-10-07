/**
 * Part 4: the settings of the GitHub repository that the signing depends on:
 * Pages, the "signing" environment, the rules on main, the deploy key that
 * lets the workflow push signed reports, and the workflows themselves.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SITE, SITE_URL } from '../../src/lib/config';
import { ROOT } from '../lib/files';
import { definePart, fail, listing, pass, skip, warn } from './checks';
import { github, IN_ACTIONS, REPO, SECRETS, secretNotHere, TOKEN } from './context';

const BRANCH = SITE.repository.branch;
const SETUP = 'README: Setting up the repository';
const WORKFLOWS = ['check.yml', 'submission-summary.yml', 'sign-and-deploy.yml', 'setup-check.yml'];

/** A verdict for an API call that was refused, which usually means missing permissions rather than a problem. */
const noAccess = (what: string, status: number) =>
  skip(`Cannot read ${what} (HTTP ${status})${TOKEN ? '' : '; set GITHUB_TOKEN to check it'}.`);

export default definePart({
  number: 4,
  title: 'GitHub settings',
  covers: `Pages, the "signing" environment, the rules on ${BRANCH}, the deploy key and the workflows of ${REPO}.`,
  file: import.meta.url,
  async run(check) {
    await check('4.1', 'GitHub Pages', async () => {
      const { status, data } = await github<{ build_type?: string; html_url?: string }>(`/repos/${REPO}/pages`);
      // Without a token GitHub answers 404 here whether or not Pages is enabled.
      if (status === 404 && !TOKEN) return noAccess('the Pages settings', status);
      if (status === 404) return fail('GitHub Pages is not enabled, so the site is not published.', `Settings → Pages → Source: GitHub Actions (${SETUP}, step 2).`);
      if (!data) return noAccess('the Pages settings', status);
      if (data.build_type !== 'workflow') return fail(`Pages is built from a branch, not by the workflow.`, `Settings → Pages → Source: GitHub Actions (${SETUP}, step 2).`);
      const published = (data.html_url ?? '').replace(/\/$/, '');
      return published && published !== SITE_URL
        ? warn(`Pages publishes at ${published}, but siteUrl is ${SITE_URL}.`, 'Make siteUrl in config/site.json match, or set up the custom domain.')
        : pass(`Published by the workflow at ${SITE_URL}.`);
    });

    await check('4.2', '"signing" environment', async () => {
      const env = await github<{ deployment_branch_policy: { custom_branch_policies: boolean; protected_branches: boolean } | null }>(
        `/repos/${REPO}/environments/signing`,
      );
      if (env.status === 404) return fail('There is no "signing" environment, so the signing key has nowhere safe to live.', `Create it (${SETUP}, step 3).`);
      if (!env.data) return noAccess('the environment', env.status);
      const policy = env.data.deployment_branch_policy;
      const restrict = `Settings → Environments → signing → Deployment branches: choose “Selected branches” and add ${BRANCH} only.`;
      if (!policy) return fail('Any branch can use the signing environment and its key.', restrict);
      if (policy.protected_branches) return warn('Any protected branch can use the signing environment.', restrict);
      const list = await github<{ branch_policies: { name: string; type?: string }[] }>(`/repos/${REPO}/environments/signing/deployment-branch-policies`);
      if (!list.data) return noAccess('the environment’s branch rules', list.status);
      const names = list.data.branch_policies.map((p) => p.name);
      if (names.length === 0) return fail('“Selected branches” is chosen, but no branch is listed.', restrict);
      if (names.some((n) => n !== BRANCH)) return warn(`Branches other than ${BRANCH} can use the key: ${listing(names)}.`, restrict);
      return pass(`Only ${BRANCH} can use the environment and its secrets.`);
    });

    await check('4.3', `Rules on ${BRANCH}`, async () => {
      const { status, data } = await github<{ type: string; parameters?: Record<string, unknown> }[]>(`/repos/${REPO}/rules/branches/${BRANCH}`);
      if (!data) return noAccess('the branch rules', status);
      const pr = data.find((r) => r.type === 'pull_request')?.parameters ?? {};
      const checks = (data.find((r) => r.type === 'required_status_checks')?.parameters?.required_status_checks ?? []) as { context: string }[];
      const missing = [
        !data.some((r) => r.type === 'pull_request') && 'require a pull request',
        !pr.require_code_owner_review && 'require review from code owners',
        !pr.dismiss_stale_reviews_on_push && 'dismiss stale approvals',
        !pr.require_last_push_approval && 'require approval of the most recent push',
        !checks.some((c) => c.context === 'check') && 'require the "check" status check',
        !data.some((r) => r.type === 'non_fast_forward') && 'block force pushes',
      ].filter((m): m is string => !!m);
      return missing.length
        ? fail(`The rules on ${BRANCH} do not ${listing(missing)}.`, `Settings → Rules → Rulesets: add these to the ruleset for ${BRANCH} (${SETUP}, step 4).`)
        : pass('Pull requests, code-owner review, fresh approvals and the "check" status check are all required.');
    });

    await check('4.4', 'Rules let the deploy key through', async () => {
      const list = await github<{ id: number; enforcement: string }[]>(`/repos/${REPO}/rulesets`);
      if (!list.data) return noAccess('the rulesets', list.status);
      const active = list.data.filter((r) => r.enforcement === 'active');
      let seen = false;
      for (const r of active) {
        const detail = await github<{ bypass_actors?: { actor_type: string; bypass_mode?: string }[] }>(`/repos/${REPO}/rulesets/${r.id}`);
        if (!detail.data?.bypass_actors) continue; // only visible to admins
        seen = true;
        if (!detail.data.bypass_actors.some((a) => a.actor_type === 'DeployKey' && a.bypass_mode !== 'pull_request')) {
          return fail('A ruleset on main does not let deploy keys bypass it, so signed reports cannot be pushed.', `Add “Deploy keys” to the ruleset’s bypass list, mode “Always” (${SETUP}, step 4).`);
        }
      }
      return seen
        ? pass('Deploy keys may bypass the rules, so the signing workflow can push signed reports.')
        : skip('Only repository admins can see the bypass list. Check that it includes “Deploy keys” (Settings → Rules → Rulesets).');
    });

    await check('4.5', 'Deploy key (SIGNING_DEPLOY_KEY)', async () => {
      if (!SECRETS.deployKey) {
        if (!IN_ACTIONS) return secretNotHere('SIGNING_DEPLOY_KEY');
        return fail(
          'The "signing" environment has no SIGNING_DEPLOY_KEY secret. The signing workflow then pushes with its own token, which the rules on main refuse, so signed reports are lost.',
          `ssh-keygen -t ed25519 -N "" -f deploy-key; gh repo deploy-key add deploy-key.pub --allow-write --title signing; gh secret set SIGNING_DEPLOY_KEY --env signing < deploy-key; rm deploy-key* (${SETUP}, step 4).`,
        );
      }
      const dir = mkdtempSync(join(tmpdir(), 'setup-check-'));
      try {
        const keyFile = join(dir, 'key');
        writeFileSync(keyFile, SECRETS.deployKey.trim() + '\n', { mode: 0o600 });
        if (spawnSync('ssh-keygen', ['-y', '-f', keyFile], { stdio: 'ignore' }).status !== 0) {
          return fail('SIGNING_DEPLOY_KEY is not a private SSH key without a passphrase.', 'Store the private key file (not the .pub file) as the secret.');
        }
        // GitHub's host keys from its API, so the connection cannot be intercepted.
        const meta = await github<{ ssh_keys: string[] }>('/meta');
        writeFileSync(join(dir, 'known_hosts'), (meta.data?.ssh_keys ?? []).map((k) => `github.com ${k}`).join('\n') + '\n');
        const ssh = `ssh -i ${keyFile} -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${join(dir, 'known_hosts')}`;
        // A dry run asks GitHub for write access but pushes nothing. The secrets are not passed on.
        const { OB_SIGNING_KEY: _a, SIGNING_DEPLOY_KEY: _b, ...env } = process.env;
        const r = spawnSync('git', ['push', '--dry-run', `git@github.com:${REPO}.git`, `HEAD:refs/heads/setup-check-dry-run`], {
          cwd: ROOT,
          env: { ...env, GIT_SSH_COMMAND: ssh },
          encoding: 'utf8',
          timeout: 60_000,
        });
        if (r.status === 0) return pass(`GitHub accepts the key with write access to ${REPO} (tested with git push --dry-run; nothing was pushed).`);
        const said = (r.stderr || r.error?.message || '').trim();
        if (/read only|read-only/i.test(said)) return fail('The deploy key is read-only.', 'Add it again with write access: gh repo deploy-key add <key>.pub --allow-write.');
        if (/permission denied|publickey/i.test(said)) {
          return fail(`GitHub does not accept SIGNING_DEPLOY_KEY for ${REPO}: it is not one of its deploy keys.`, 'Settings → Deploy keys: add the public half of the key, with write access.');
        }
        if (/host key verification failed/i.test(said)) return fail('Could not confirm GitHub’s SSH host key, so the key was not tried.', 'Run the check again.');
        const reason = said.split('\n').find((l) => /error|fatal/i.test(l)) ?? `exit code ${r.status}`;
        return fail(`git push --dry-run failed: ${reason.replace(/\.$/, '')}.`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    await check('4.6', 'Workflows', async () => {
      const missing = WORKFLOWS.filter((f) => !existsSync(join(ROOT, '.github', 'workflows', f)));
      if (missing.length) return fail(`Missing from .github/workflows: ${listing(missing)}.`, 'Restore them from the repository history.');
      const { status, data } = await github<{ workflows: { path: string; state: string }[] }>(`/repos/${REPO}/actions/workflows`);
      if (!data) return noAccess('the workflows', status);
      const off = data.workflows.filter((w) => WORKFLOWS.some((f) => w.path.endsWith(f)) && w.state !== 'active').map((w) => w.path);
      return off.length
        ? fail(`Disabled: ${listing(off)}.`, 'Actions → select the workflow → Enable workflow.')
        : pass(`${listing(WORKFLOWS)} are present and enabled.`);
    });

    await check('4.7', 'Last "Sign and deploy" run', async () => {
      const { status, data } = await github<{ workflow_runs: { conclusion: string | null; status: string; html_url: string; created_at: string; head_sha: string }[] }>(
        `/repos/${REPO}/actions/workflows/sign-and-deploy.yml/runs?branch=${BRANCH}&per_page=1`,
      );
      if (!data) return noAccess('the workflow runs', status);
      const run = data.workflow_runs[0];
      if (!run) return warn('It has never run.', `Push to ${BRANCH}, or run it from the Actions tab.`);
      const when = run.created_at.slice(0, 16).replace('T', ' ');
      if (run.status !== 'completed') return skip(`Running now (started ${when} UTC): ${run.html_url}`);
      let head = '';
      try {
        head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
      } catch {
        /* not a git checkout */
      }
      const behind = head && IN_ACTIONS && run.head_sha !== head ? ' It ran on an earlier commit than this check.' : '';
      return run.conclusion === 'success'
        ? pass(`Succeeded on ${when} UTC.${behind}`)
        : fail(`It ended with “${run.conclusion}” on ${when} UTC.`, `Read its log: ${run.html_url}`);
    });
  },
});
