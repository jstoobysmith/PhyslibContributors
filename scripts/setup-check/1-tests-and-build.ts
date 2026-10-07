/**
 * Part 1: the unit tests and the site build. They run in the workflow's first
 * job ("Tests and build"), which holds no secrets; its results are passed in as
 * TESTS_OUTCOME, TESTS_SUMMARY and BUILD_OUTCOME.
 */
import { definePart, fail, pass, skip, type Verdict } from './checks';

const fromFirstJob = (outcome: string | undefined, step: string, ok: string, local: string): Verdict => {
  if (!outcome) return skip(`Runs in the "Tests and build" job of the Setup check workflow. Locally: ${local}.`);
  if (outcome === 'success') return pass(ok);
  return fail(
    outcome === 'failure' ? `The "${step}" step failed.` : `The "${step}" step did not run (${outcome}).`,
    `Open the "Tests and build" job of this run and read the "${step}" step.`,
  );
};

export default definePart({
  number: 1,
  title: 'Tests and build',
  covers: 'The unit tests (signing, verification, approval rules, submissions) and the build of the site.',
  file: import.meta.url,
  async run(check) {
    await check('1.1', 'Unit tests', () =>
      fromFirstJob(process.env.TESTS_OUTCOME, 'Unit tests', process.env.TESTS_SUMMARY || 'All tests passed.', 'npm test'),
    );

    await check('1.2', 'Site build', () =>
      fromFirstJob(process.env.BUILD_OUTCOME, 'Build the site', 'The site builds without errors.', 'npm run build'),
    );
  },
});
