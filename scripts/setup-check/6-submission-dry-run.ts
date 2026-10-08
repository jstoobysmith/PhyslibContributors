/**
 * Part 6: one made-up submission, followed through every step a real one
 * takes, without touching GitHub: the form's output is validated, the
 * summary is written, the approval rules are applied with the listed
 * maintainers (for pull requests and for issues), the credential is built, signed with the real key, verified as
 * the site does, and baked into a badge image.
 */
import Ajv2019 from 'ajv/dist/2019.js';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateKeyPair, publicKeyFor, sign, type JsonObject } from '../../src/lib/dataIntegrity';
import { buildCredential, type OpenBadgeCredential } from '../../src/lib/credential';
import { bakeSvg, unbakeSvg } from '../../src/lib/baking';
import { CONFLICT_DECLARATION, approvalDecision, issueApprovalDecision, type IssueComment, type PullRequestReview } from '../../src/lib/review';
import { ACCEPT_COMMAND } from '../../src/lib/issue-submission';
import { issuerDidDocument, isoSeconds, ISSUER_DID, KEYS, MAINTAINERS, SIGNING_KEY, SITE, verificationMethodId } from '../../src/lib/config';
import { githubLoginFromInput, submissionMarkdown, submissionSchema, submissionSlug, type Submission } from '../../src/lib/submission';
import { verifyCredential } from '../../src/lib/verify';
import { readJson, ROOT } from '../lib/files';
import { definePart, fail, pass, warn } from './checks';
import { SECRETS } from './context';

const RECIPIENT = 'setup-check-contributor';

export default definePart({
  number: 6,
  title: 'Dry run of a submission',
  covers: 'A made-up submission, followed from the form to a signed, verified, baked report (nothing is published).',
  file: import.meta.url,
  async run(check) {
    let submission: Submission | undefined;
    let slug = '';
    await check('6.1', 'Form → submission file', () => {
      const example = readJson<Submission>(join(ROOT, 'examples', 'specimen.submission.json'));
      const typed = { ...example, recipient: { ...example.recipient, github: githubLoginFromInput(`@${RECIPIENT}`) }, submittedAt: isoSeconds() };
      const parsed = submissionSchema.safeParse(typed);
      if (!parsed.success) return fail(`The example submission is invalid: ${parsed.error.issues.map((i) => i.message).join('; ')}.`, 'Fix examples/specimen.submission.json.');
      submission = parsed.data;
      slug = submissionSlug(submission);
      return pass(`Valid, saved as submissions/${slug}.json.`);
    });
    if (!submission) return;
    const s = submission;

    await check('6.2', 'Summary for maintainers', () => {
      const text = submissionMarkdown(s);
      return text.includes(s.title.slice(0, 20)) && text.includes(`@${RECIPIENT}`)
        ? pass('The summary posted on each submission issue or pull request is written.')
        : fail('The pull request summary is missing the title or the recipient.');
    });

    await check('6.3', 'Approval rules for pull requests', () => {
      const required = SITE.review.requiredApprovals;
      const approvers = MAINTAINERS.slice(0, required);
      if (approvers.length < required) return fail(`Only ${MAINTAINERS.length} maintainer(s) are listed, but ${required} approvals are needed.`, 'Add maintainers to config/maintainers.json.');
      const head = 'f'.repeat(40);
      const review = (m: (typeof MAINTAINERS)[number], body: string): PullRequestReview => ({
        state: 'APPROVED',
        user: { login: m.github, id: m.id },
        body,
        commit_id: head,
        submitted_at: isoSeconds(),
      });
      const pr = { author: RECIPIENT, headSha: head };
      const approved = approvalDecision(approvers.map((m) => review(m, `Checked the evidence. I have ${CONFLICT_DECLARATION}.`)), pr, s);
      const undeclared = approvalDecision(approvers.map((m) => review(m, 'Looks good.')), pr, s);
      const self = approvalDecision(approvers.map((m) => review(m, CONFLICT_DECLARATION)), { ...pr, author: approvers[0].github }, { ...s, recipient: { ...s.recipient, github: approvers[0].github } });
      if (!approved.ok) return fail(`Approval by ${approvers.map((m) => '@' + m.github).join(', ')} was refused: ${approved.reason}.`);
      if (undeclared.ok) return fail('An approval without the conflict declaration was accepted.');
      if (self.ok) return fail('A maintainer could approve their own submission.');
      const who = approvers.map((m) => '@' + m.github).join(', ');
      return pass(`Accepted when ${who} approve${approvers.length === 1 ? 's' : ''} with “${CONFLICT_DECLARATION}”; refused without it, and refused for their own work.`);
    });

    await check('6.4', 'Approval rules for submissions made as issues', () => {
      const required = SITE.review.requiredApprovals;
      const approvers = MAINTAINERS.slice(0, required);
      if (approvers.length < required) return fail('Not enough maintainers are listed (see 6.3).');
      const at = (minute: number) => `2026-01-01T00:${String(minute).padStart(2, '0')}:00Z`;
      const accept = (m: (typeof MAINTAINERS)[number], minute: number): IssueComment => ({
        user: { login: m.github, id: m.id },
        body: `${ACCEPT_COMMAND} I have ${CONFLICT_DECLARATION}.`,
        created_at: at(minute),
      });
      const issue = { author: RECIPIENT, lastEditedAt: at(1) };
      const accepted = issueApprovalDecision(approvers.map((m) => accept(m, 2)), issue, s);
      const beforeEdit = issueApprovalDecision(approvers.map((m) => accept(m, 0)), issue, s);
      const otherAuthor = issueApprovalDecision(approvers.map((m) => accept(m, 2)), { ...issue, author: 'someone-else' }, s);
      if (!accepted.ok) return fail(`“${ACCEPT_COMMAND}” from ${approvers.map((m) => '@' + m.github).join(', ')} was refused: ${accepted.reason}.`);
      if (beforeEdit.ok) return fail('An acceptance made before the issue was last edited still counted.');
      if (otherAuthor.ok) return fail('A submission opened by someone other than the contributor was accepted.');
      return pass(`Accepted by “${ACCEPT_COMMAND} I have ${CONFLICT_DECLARATION}”; refused when the issue was edited afterwards, or opened by someone else.`);
    });

    let credential: JsonObject | undefined;
    await check('6.5', 'Open Badges 3.0 credential', () => {
      credential = buildCredential(slug, s, {
        acceptedAt: isoSeconds(),
        pullRequest: { number: 1, url: `https://github.com/${SITE.repository.owner}/${SITE.repository.name}/pull/1`, author: RECIPIENT },
        reviewers: MAINTAINERS.slice(0, SITE.review.requiredApprovals).map((m) => m.github),
      });
      const schema = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'ob_v3p0_achievementcredential_schema.json'), 'utf8'));
      const ajv = new Ajv2019({ strict: false, allErrors: true });
      addFormats(ajv);
      const validate = ajv.compile(schema);
      return validate(credential)
        ? pass('Matches 1EdTech’s official Open Badges 3.0 AchievementCredential schema.')
        : fail(`Does not match the Open Badges 3.0 schema: ${ajv.errorsText(validate.errors)}.`);
    });
    if (!credential) return;
    const unsigned = credential;

    let signed: JsonObject | undefined;
    await check('6.6', 'Signed and verified as the site does', async () => {
      // The real key when it is available; otherwise a throwaway key, which shows the code works but not the secret.
      let secretKeyMultibase: string | undefined;
      try {
        secretKeyMultibase = SECRETS.signingKey ? (JSON.parse(SECRETS.signingKey) as { secretKeyMultibase: string }).secretKeyMultibase : undefined;
        if (secretKeyMultibase && !KEYS.some((k) => k.publicKeyMultibase === publicKeyFor(secretKeyMultibase!))) secretKeyMultibase = undefined;
      } catch {
        secretKeyMultibase = undefined;
      }
      const real = !!secretKeyMultibase && !!SIGNING_KEY;
      const pair = real ? undefined : generateKeyPair();
      const keyId = real ? SIGNING_KEY!.id : 'throwaway';
      signed = await sign(unsigned, { secretKeyMultibase: secretKeyMultibase ?? pair!.secretKeyMultibase, verificationMethod: verificationMethodId(keyId) });
      const did = issuerDidDocument();
      const resolveDid = async () =>
        real ? did : { ...did, verificationMethod: [{ id: verificationMethodId(keyId), type: 'Multikey', controller: ISSUER_DID, publicKeyMultibase: pair!.publicKeyMultibase }], assertionMethod: [verificationMethodId(keyId)] };
      const r = await verifyCredential(signed, { resolveDid, trustedIssuers: [ISSUER_DID], revoked: [] });
      if (!r.valid) return fail(`The signed report does not verify: ${r.checks.filter((c) => c.status === 'fail').map((c) => c.detail).join('; ')}.`);
      return real
        ? pass(`Signed with ${keyId} (the OB_SIGNING_KEY secret) and verified as genuine.`)
        : warn('Signed with a throwaway key and verified: the code works, but the real key was not available here (see 3.3).');
    });
    if (!signed) return;
    const report = signed;

    await check('6.7', 'Tampering is detected', async () => {
      const edited = { ...report, name: `${String(report.name)} (edited)` };
      const r = await verifyCredential(edited, { resolveDid: async () => issuerDidDocument(), trustedIssuers: [ISSUER_DID] });
      return r.valid ? fail('A report with an edited title still verified.') : pass('A report with an edited title no longer verifies.');
    });

    await check('6.8', 'Badge image with the report inside', () => {
      const svg = readFileSync(join(ROOT, 'public', 'badges', `${s.section}.svg`), 'utf8');
      const back = unbakeSvg(bakeSvg(svg, report));
      return back && (JSON.parse(back) as OpenBadgeCredential).proof?.proofValue === (report as unknown as OpenBadgeCredential).proof?.proofValue
        ? pass(`The report is embedded in public/badges/${s.section}.svg and read back unchanged.`)
        : fail('The report could not be read back from the badge image.');
    });
  },
});
