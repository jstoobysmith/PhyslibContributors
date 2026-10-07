# Physlib Contributions

**Signed, verifiable awards for the work that keeps formal physics standing.**

Physlib Contributions publishes awards, not papers. The awards recognise four
kinds of contribution to [Physlib](https://physlib.io) that rarely lead to a
publication:

| Section | Award | For |
| --- | --- | --- |
| I | Physlib Review Award | Reviewing pull requests |
| II | Physlib Maintenance Award | Version bumps, CI, tooling, triage |
| III | Physlib Refactoring Award | Generalising, unifying, reorganising |
| IV | Physlib Foundations Award | Core definitions other results build on |

Every step happens on GitHub:

| Step | How |
| --- | --- |
| Submission | A pull request adding `submissions/<name>.json` |
| Review | Maintainers review the pull request in public |
| Acceptance | A maintainer merges it |
| Signing | A GitHub workflow signs it as an **Open Badges 3.0** credential using the `OB_SIGNING_KEY` secret |
| Trust | The Ed25519 signing key is published as a `did:web` DID document and, later, in the physlib.io DNS |

The design follows [myopenbadge](https://github.com/saiyam1814/myopenbadge): a
static React site, with GitHub as the only source of truth. Unlike myopenbadge,
contributors open the pull requests themselves, and credentials are
cryptographically signed with an OB 3.0 Data Integrity proof, not merely hosted.

## How it fits together

```
 contributor                      awards repository (GitHub)                        anyone
 ───────────                      ───────────────────────────                       ──────
 /submit form ──PR──▶ submissions/x.json ──check.yml: validate + preview
                                   │
                maintainers review; approve; merge
                                   │
                  sign-and-deploy.yml (push to main, "signing" environment)
                  ├─ scripts/sign.ts: check approvals (src/lib/review.ts),
                  │  build the OB 3.0 credential, sign with OB_SIGNING_KEY,
                  │  assign the next award number
                  ├─ commit public/credentials/x.json, data/award-numbers.json
                  └─ build & deploy site to GitHub Pages ───▶ /awards/x
                                                               checked in the browser
                                                               against /did.json
```

**Configuration** (edited by hand, except `keys.json`)

| File | Contents |
| --- | --- |
| `config/site.json` | site URL, repository, issuer profile, DNS name, number of approvals required |
| `config/sections.json` | the four sections: names, criteria, guidance |
| `config/maintainers.json` | who may approve awards (names are shown on the site) |
| `config/keys.json` | public signing keys and their status (written by `npm run keygen`) |
| `config/revocations.json` | revoked awards |

**Records** (written by the signing workflow; never edit by hand)

| Path | Contents |
| --- | --- |
| `submissions/` | accepted submissions, one JSON file each (added by pull requests) |
| `public/credentials/` | the signed credentials |
| `data/award-numbers.json` | the permanent number of each award |
| `public/specimen.json` | the sample award, signed from `examples/specimen.submission.json` |

**Code**

| Path | Contents |
| --- | --- |
| `src/lib/` | shared by the site and the scripts, no browser APIs (checked by `tsconfig.node.json`): config, submission schema, credential builder, `eddsa-rdfc-2022` signing (`dataIntegrity.ts`), verification, approval rules, awards index |
| `src/site/` | browser-only helpers: data loading, opening pull requests, the submission draft |
| `src/components/`, `src/pages/` | the React site |
| `scripts/` | `sign`, `validate`, `verify`, `keygen`, `static` (generates `did.json`, the awards index and other files under `public/`) |
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
python3 scripts/draw-badges.py                            # redraw the section badges
```

## Rules for approving awards

`src/lib/review.ts` and `scripts/sign.ts` sign an award only if:

- the pull request that last changed the submission was opened by the
  recipient or the nominator, and merged into `main`;
- the file on `main` is exactly what that pull request merged;
- it has at least `review.requiredApprovals` (in `config/site.json`) approvals
  **on its final commit** from people in `config/maintainers.json` (matched by
  numeric GitHub id where one is given), each including the phrase in
  `review.conflictDeclaration` ("no conflict of interest");
- none of those approvals comes from the recipient, anyone named as joint
  work, the nominator or the pull request's author, and none of them merged it.

Only each person's latest review counts. A refused submission is reported as
an error in the workflow run; re-running it after more approvals signs it.

## Reviewing a submission

`submission-summary.yml` posts a summary on each submission's pull request:
the submission, the section's criteria as a checklist, any evidence already
used in another award, and the recipient's previous awards.

1. Open each evidence link and tick the criteria. "Substantive" means the
   comments or changes affected the physics, the Lean code or the documentation.
2. If the work is better split across sections, or several small submissions
   would be better as one, say so and ask for changes.
3. To approve, submit an *Approve* review that includes "I have no conflict of
   interest". Do not approve if you supervise, co-authored the work with, or
   work closely with the recipient.
4. Merge when the required approvals are in. Signing follows within minutes.

To decline, close the pull request with a short, kind note, for example:

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
   most recent push. The signing workflow commits signed awards to `main`
   using a write **deploy key** stored as `SIGNING_DEPLOY_KEY` in the `signing`
   environment; let deploy keys bypass the ruleset. (On a personal account,
   GitHub does not allow the GitHub Actions app itself as a bypass actor.)
   The signing script also ignores approvals that are not on a pull request's
   final commit.
5. **List the maintainers** in `config/maintainers.json`.
6. Push to `main`. The workflow signs the specimen award and deploys the site.

Without the secret, merged submissions stay unsigned ("awaiting signature")
and the site still deploys.

## Keys, DID and the physlib.io DNS

The issuer is identified as `did:web:<site host>[:<path>]`, derived from
`siteUrl`. The site publishes the DID document at `/did.json` and
`/.well-known/did.json`. It lists every key in `config/keys.json` except
revoked ones, so awards signed with a retired key keep verifying.

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
5. Run the **Sign and deploy** workflow manually with *Re-sign every award*
   ticked. Each award is re-signed with its content unchanged; only the issuer
   and the URLs under the old site address are updated.

**If a key is compromised**, set its status to `revoked` in `config/keys.json`
(it disappears from the DID document, so nothing it signed verifies any more),
generate a new key, and re-sign as above.

## Revoking an award

Add `{ "id": "<credential id>", "reason": "…", "date": "YYYY-MM-DD" }` to
`config/revocations.json`. Verifiers on this site and `npm run verify` will
then reject the credential, and it is marked "Revoked" in the list of awards.
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
  untrusted issuers, revoked awards and credentials that are not yet valid,
- the approval rules reject non-maintainers, conflicts of interest and
  withdrawn approvals,
- baked SVG badges round-trip.

Credentials leave out `credentialSchema`. Its `1EdTechJsonSchemaValidator2019`
type is not defined in any JSON-LD context, so strict verifiers reject
credentials that include it.
