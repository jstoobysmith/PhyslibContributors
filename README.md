# Physlib Contributions

**Short, citable, signed reports on the work that keeps formal physics standing.**

Physlib Contributions publishes short reports, much like technical reports, on six
kinds of contribution to [Physlib](https://physlib.io) that rarely lead to a
publication:

| Section | Report | For |
| --- | --- | --- |
| I | Physlib Review Report | Reviewing pull requests |
| II | Physlib Maintenance Report | Version bumps, CI, tooling, triage |
| III | Physlib Refactoring Report | Generalising, unifying, reorganising |
| IV | Physlib Foundations Report | Core definitions other results build on |
| V | Physlib Formalisation Report | New lemmas, definitions and results, including many small additions |
| VI | Physlib Documentation Report | Docstrings, module overviews, guides and tutorials |

For trying the whole process out, the form also has a **Test** section
(`/submit?section=test`). It fills in every field except the GitHub username
and ORCID iD. Test submissions need no approvals: once a maintainer accepts
one, it is signed like a real one, but its report says it is a test, is not
numbered, and is listed only in a "Test reports" box on the archive page.

Every step happens on GitHub:

| Step | How |
| --- | --- |
| Submission | An issue opened with the form on the site, which fills in the submission; no fork is needed. (A pull request adding `submissions/<name>.json` also works.) |
| Review | Maintainers review the issue in public |
| Acceptance | Maintainers comment `/accept I have no conflict of interest`; a workflow checks the rules and commits `submissions/<name>.json` |
| Signing | A GitHub workflow signs it as an **Open Badges 3.0** credential using the `OB_SIGNING_KEY` secret |
| Trust | The Ed25519 signing key is published as a `did:web` DID document and, later, in the physlib.io DNS |

The design follows [myopenbadge](https://github.com/saiyam1814/myopenbadge): a
static React site, with GitHub as the only source of truth. Unlike myopenbadge,
contributors open the pull requests themselves, and credentials are
cryptographically signed with an OB 3.0 Data Integrity proof, not merely hosted.

## How it fits together

```
 contributor                      reports repository (GitHub)                        anyone
 ───────────                      ───────────────────────────                       ──────
 /submit form ──issue──▶ submission-issue.yml: summary
                                   │
                maintainers review; comment "/accept …"
                                   │
                submission-issue.yml: check approvals, commit submissions/x.json
                (or: a pull request adding it, reviewed and merged; check.yml)
                                   │
                  sign-and-deploy.yml (push to main, "signing" environment)
                  ├─ scripts/sign.ts: check approvals (src/lib/review.ts),
                  │  build the OB 3.0 credential, sign with OB_SIGNING_KEY,
                  │  assign the next report number
                  ├─ commit public/credentials/x.json, data/report-numbers.json
                  └─ build & deploy site to GitHub Pages ───▶ /reports/x
                                                               checked in the browser
                                                               against /did.json
```

**Configuration** (edited by hand, except `keys.json`)

| File | Contents |
| --- | --- |
| `config/site.json` | site URL, repository, issuer profile, DNS name, number of approvals required |
| `config/sections.json` | the six sections (names, criteria, guidance, examples), and the test section |
| `config/maintainers.json` | who may approve reports (names are shown on the site) |
| `config/keys.json` | public signing keys and their status (written by `npm run keygen`) |
| `config/revocations.json` | revoked reports |

**Records** (written by the signing workflow; never edit by hand)

| Path | Contents |
| --- | --- |
| `submissions/` | accepted submissions, one JSON file each (added by pull requests) |
| `public/credentials/` | the signed credentials |
| `data/report-numbers.json` | the permanent number of each report |
| `public/specimen.json` | the sample report, signed from `examples/specimen.submission.json` |

**Code**

| Path | Contents |
| --- | --- |
| `src/lib/` | shared by the site and the scripts, no browser APIs (checked by `tsconfig.node.json`): config, submission schema, credential builder, `eddsa-rdfc-2022` signing (`dataIntegrity.ts`), verification, approval rules, reports index |
| `src/site/` | browser-only helpers: data loading, opening pull requests, the submission draft |
| `src/components/`, `src/pages/` | the React site |
| `scripts/` | `sign`, `validate`, `verify`, `keygen`, `static` (generates `did.json`, the reports index and other files under `public/`) |
| `scripts/setup-check/` | the setup check (see "Checking the set-up"): one file per numbered part |
| `test/` | one test file per module in `src/lib/` |

## Commands

```bash
npm install
npm run dev          # local site at http://localhost:5173/PhyslibContributors/
npm test             # unit tests (see "Standards and testing")
npm run build        # static site in dist/

npm run validate                                          # check every submission
npm run sign -- --key .keys/key-1.json --no-review-check  # sign locally, for testing only
npm run verify -- public/specimen.json --local            # check any credential (file or URL)
npm run keygen                                            # new signing key (see below)
npm run setup-check                                       # check the whole set-up (see below)
npm run setup-check -- --json public/data/status.json     # also preview the results on /status
python3 scripts/draw-badges.py                            # redraw the section badges
```

## Links that fill in the form

A link to `/submit` can fill in the form, so you can send someone a submission
that is ready to check and send, for example to nominate them. Build one with
*Copy a link to this form* on the form, or by hand:

```
https://jstoobysmith.github.io/PhyslibContributors/submit?section=review&name=Ada%20Example&github=ada&title=Reviewed%2010%20pull%20requests%20on%20quantum%20mechanics&prs=1749,1747,1744
```

| Parameter | Fills in |
| --- | --- |
| `section` | `review`, `maintenance`, `refactoring`, `foundations`, `formalisation`, `documentation` or `test` |
| `name`, `github`, `orcid` | who did the work |
| `nominator` | the GitHub username of whoever is nominating them (they still confirm consent themselves) |
| `title`, `summary` | the work (URL-encoded; `%0A` for a new line) |
| `from`, `to` | months, `YYYY-MM` |
| `prs` | Physlib pull request numbers, separated by commas (their titles are looked up) |
| `link` | any other evidence link; repeat for several |

Opening such a link replaces any draft saved in that browser, says that the
form was filled in from a link, and sends nothing. The code is in
`src/lib/prefill.ts`.

## Rules for approving reports

`src/lib/review.ts` and `scripts/sign.ts` sign a report only if:

- it was submitted by the recipient or the nominator: they opened its issue,
  or the pull request that last changed it, which was merged into `main`;
- the file on `main` is exactly the submission in the issue, or exactly what
  that pull request merged;
- it has at least `review.requiredApprovals` (in `config/site.json`) approvals
  **on its final version** from people in `config/maintainers.json` (matched
  by numeric GitHub id where one is given), each including the phrase in
  `review.conflictDeclaration` ("no conflict of interest"). On an issue, an
  approval is a comment starting `/accept`; an edit to the issue afterwards
  voids it. On a pull request, it is an *Approve* review on its last commit;
- none of those approvals comes from the recipient, anyone named as joint
  work, the nominator or whoever opened the issue or pull request, and none
  of them merged it.

The *Submission issue* workflow checks the same rules before it commits an
accepted submission (`scripts/issue-submission.ts`), and records the issue in
`data/issue-submissions.json`; `scripts/sign.ts` checks them again before
signing. Maintainers need no write access to accept a submission on an issue.

Test submissions (the test section) are exempt from these rules: a
maintainer's `/accept` (or merging the pull request) is enough. Their reports
say they are tests, and are not numbered or listed with real reports.

Only each person's latest approval counts. A refused submission is reported as
an error in the workflow run; re-running it after more approvals signs it.

## Reviewing a submission

`submission-issue.yml` (for issues) and `submission-summary.yml` (for pull
requests) post a summary on each submission: the submission, the section's
criteria as a checklist, any evidence already used in another report, and the
contributor's previous reports.

1. Open each evidence link and tick the criteria. "Substantive" means the
   comments or changes affected the physics, the Lean code or the documentation.
2. If the work is better split across sections, or several small submissions
   would be better as one, say so and ask for changes.
3. To approve an issue, comment `/accept I have no conflict of interest`.
   (On a pull request, submit an *Approve* review saying "I have no conflict
   of interest", and merge once the approvals are in.) Do not approve if you
   supervise, co-authored the work with, or work closely with the recipient.
4. When the required approvals are in, the submission is accepted, the issue
   closed, and the report signed within minutes. If the contributor edits the
   issue after you accept, accept it again.

To decline, close the issue or pull request with a short, kind note, for example:

> Thank you for submitting this. We don't think it meets the criteria for
> this section yet (in particular, …). That is not a judgement on the value
> of the work, and you are welcome to submit again later.

## Before launch

- List at least two maintainers in `config/maintainers.json`, so the conflict
  rules can always be followed, and confirm the appointment text in
  `config/site.json` (`review.appointment`).
- Move to a physlib.io address and the permanent key (see below).
- Make the repository public.

## Setting up the repository

The site has not been deployed yet. To go live:

1. **Create the GitHub repository** given in `config/site.json` (currently
   `jstoobysmith/PhyslibContributors`) and push this code. If you use a
   different owner or name, also update `siteUrl` and `basePath`.
2. **Enable Pages:** Settings → Pages → Source: *GitHub Actions*.
3. **Create the `signing` environment** (Settings → Environments), restrict
   it to the `main` branch, and store the key there. A temporary key
   (`key-1`) has already been generated; its secret half is in the
   git-ignored `.keys/key-1.json`:
   ```bash
   gh secret set OB_SIGNING_KEY --env signing --repo jstoobysmith/PhyslibContributors < .keys/key-1.json
   rm .keys/key-1.json   # once the secret is stored
   ```
4. **Protect `main`** with a ruleset: require pull requests with review from
   code owners (`.github/CODEOWNERS` covers everything that runs with the key
   or is signed with it), dismiss stale approvals, and require approval of the
   most recent push. The signing workflow commits signed reports to `main`
   using a write **deploy key** stored as `SIGNING_DEPLOY_KEY` in the `signing`
   environment; let deploy keys bypass the ruleset. (On a personal account,
   GitHub does not allow the GitHub Actions app itself as a bypass actor.)
   The signing script also ignores approvals that are not on a pull request's
   final commit.
5. **List the maintainers** in `config/maintainers.json`.
6. Push to `main`. The workflow signs the specimen report and deploys the site.
7. **Run the setup check** (Actions → *Setup check* → *Run workflow*) and fix
   anything it reports.

Without the secret, merged submissions stay unsigned ("awaiting signature")
and the site still deploys.

## Checking the set-up

The **Setup check** workflow (`.github/workflows/setup-check.yml`, run by hand
from the Actions tab) tests everything the site depends on, without changing,
signing or publishing anything. Run it after changing settings, keys or
maintainers, and before launch. Its results are on the run's summary page, and
failures and warnings are also shown as annotations there.

The checks are grouped into seven numbered parts, one file each in
`scripts/setup-check/`. Check 4.2 is the second check in
`4-github-settings.ts`.

| Part | Checks |
| --- | --- |
| 1. Tests and build | the unit tests and the site build (run in a first job without secrets) |
| 2. Configuration | `config/` and `.github/CODEOWNERS`: site address, sections, maintainers and their GitHub ids, approval rules, draft flag |
| 3. Signing keys | `config/keys.json`; that `OB_SIGNING_KEY` is the private half of the active key and signs; the DNS record |
| 4. GitHub settings | Pages; the `signing` environment is limited to `main`; the rules on `main`; `SIGNING_DEPLOY_KEY` can push (by `git push --dry-run`, which pushes nothing); the workflows; the last *Sign and deploy* run |
| 5. Submissions and signed reports | every submission is valid; why any accepted submission is unsigned; every report verifies; report numbers; revocations; the specimen |
| 6. Dry run of a submission | a made-up submission through the form's validation, the pull request summary, the approval rules, the credential (against the official OB 3.0 schema), signing with the real key, verification, tamper detection and badge baking |
| 7. Live site | the published DID document; that the public key the site publishes and shows on `/verify` matches the private key in `OB_SIGNING_KEY`; the revocation list and list of reports; that the published reports verify online |

Each check passes (✓), warns (!: works, but needs attention, usually before
launch), fails (✗: something will not work until it is fixed) or is skipped
(–: cannot be checked there). Every warning and failure says how to fix it.
The workflow fails if any check fails.

The results are also published on the site's **status page**, `/status`
(linked as "Site status" in the footer). The workflow saves them as the
`setup-check-status` artifact; when it finishes, *Sign and deploy* runs and
publishes the latest results with the site, so the page is up to date a few
minutes after each check. Nothing secret is in them: the check never prints
the keys.

Locally, `npm run setup-check` runs the same checks except those that need
the secrets (add `-- --key .keys/key-1.json` to include a local signing key,
and `GITHUB_TOKEN=$(gh auth token)` in front to read the GitHub settings).

## Keys, DID and the physlib.io DNS

The issuer is identified as `did:web:<site host>[:<path>]`, derived from
`siteUrl`. The site publishes the DID document at `/did.json` and
`/.well-known/did.json`. It lists every key in `config/keys.json` except
revoked ones, so reports signed with a retired key keep verifying.

The key will also be tied to Physlib's DNS: the site looks up a TXT record at
`_openbadges.physlib.io` over DNS-over-HTTPS and checks that it names the
signing key. This is a convention of this site, not part of Open Badges.

```
_openbadges.physlib.io.  TXT  "v=OB3; did=<issuer DID>; key=<publicKeyMultibase>"
```

**Replacing the temporary key with the permanent one** (for example when
moving to a physlib.io domain):

1. If the domain changes, set `siteUrl`, and set `basePath` to `/`. Add a
   `public/CNAME` file. The DID becomes `did:web:<new host>`.
2. Run `npm run keygen -- --status active`. This marks `key-1` as retired and
   prints the exact TXT record to add.
3. Store the new `.keys/key-N.json` as `OB_SIGNING_KEY` in the `signing`
   environment, then commit `config/keys.json`.
4. Add the TXT record to the DNS zone.
5. Run the **Sign and deploy** workflow manually with *Re-sign every report*
   ticked. Each report is re-signed with its content unchanged; only the issuer
   and the URLs under the old site address are updated.

**If a key is compromised**, set its status to `revoked` in `config/keys.json`
(it disappears from the DID document, so nothing it signed verifies any more),
generate a new key, and re-sign as above.

## Revoking a report

Add `{ "id": "<credential id>", "reason": "…", "date": "YYYY-MM-DD" }` to
`config/revocations.json`. Verifiers on this site and `npm run verify` will
then reject the credential, and it is marked "Revoked" in the list of reports.
Published credential files are never edited.

## Standards and testing

Credentials are [Open Badges 3.0](https://www.imsglobal.org/spec/ob/v3p0/)
`OpenBadgeCredential`s (W3C VC Data Model 2.0). Each has an embedded
`DataIntegrityProof` using the `eddsa-rdfc-2022` cryptosuite. JSON-LD contexts
are vendored in `src/lib/contexts/`, so signing and verification never fetch
them over the network. The test suite checks that:

- the implementation reproduces the W3C `vc-di-eddsa` test vector byte for byte,
- signatures interoperate in both directions with Digital Bazaar's reference
  implementation (`@digitalbazaar/eddsa-rdfc-2022-cryptosuite`),
- generated credentials validate against 1EdTech's official OB 3.0
  AchievementCredential JSON schema,
- verification rejects tampering, unknown keys, issuer mismatches,
  untrusted issuers, revoked reports and credentials that are not yet valid,
- the approval rules reject non-maintainers, conflicts of interest and
  withdrawn approvals,
- baked SVG badges round-trip.

Credentials leave out `credentialSchema`. Its `1EdTechJsonSchemaValidator2019`
type is not defined in any JSON-LD context, so strict verifiers reject
credentials that include it.
