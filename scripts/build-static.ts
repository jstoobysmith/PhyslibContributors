/**
 * Generates the static, unsigned documents the site publishes alongside the
 * signed credentials. Runs before every dev server start and build.
 *
 *   public/did.json, public/.well-known/did.json   issuer DID document (did:web)
 *   public/issuer.json                             OB 3.0 issuer Profile
 *   public/achievements/<section>.json             OB 3.0 Achievement definitions
 *   public/revocations.json                        revoked credential ids
 *   public/data/reports.json                        index of reports for the site
 *   public/schemas/submission.schema.json          JSON schema for submissions
 */
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { issuerDidDocument, SECTIONS, SITE_URL, urls, type Revocation } from '../src/lib/config';
import { achievement, issuerProfile, OB_CONTEXT } from '../src/lib/credential';
import { buildReportsIndex } from '../src/lib/reports';
import { submissionSchema } from '../src/lib/submission';
import { listCredentials, listSubmissionFiles, loadSubmission, readReportNumbers, readJson, ROOT, writeJson } from './lib/files';

const out = (p: string) => join(ROOT, 'public', p);

// --- DID document ------------------------------------------------------------------
const didDocument = issuerDidDocument();
writeJson(out('did.json'), didDocument);
writeJson(out('.well-known/did.json'), didDocument);

// --- OB 3.0 Profile and Achievements --------------------------------------------
writeJson(out('issuer.json'), { '@context': OB_CONTEXT, ...issuerProfile() });
rmSync(out('achievements'), { recursive: true, force: true }); // no stale files from renamed series
for (const section of SECTIONS) {
  writeJson(out(`achievements/${section.id}.json`), { '@context': OB_CONTEXT, ...achievement(section) });
}

const revocations = readJson<Revocation[]>(join(ROOT, 'config', 'revocations.json'));
writeJson(out('revocations.json'), revocations);

// --- Index of reports -----------------------------------------------------------------
const submissions = new Map(
  listSubmissionFiles()
    .map(loadSubmission)
    .filter((s) => s.submission)
    .map((s) => [s.slug, s.submission!]),
);
const index = buildReportsIndex(listCredentials(), submissions, readReportNumbers(), revocations.map((r) => r.id));
writeJson(out('data/reports.json'), index);

// --- Submission JSON schema -------------------------------------------------------
writeJson(out('schemas/submission.schema.json'), {
  ...z.toJSONSchema(submissionSchema, { io: 'input' }),
  $id: urls.submissionSchema(),
  title: 'Physlib Contributions submission',
});

console.log(
  `static: ${didDocument.verificationMethod.length} key(s) for ${didDocument.id} at ${SITE_URL}; ${index.published.length} published, ${index.pending.length} awaiting signature`,
);
