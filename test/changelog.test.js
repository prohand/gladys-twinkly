import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-twinkly';

test('the first release moves Unreleased under its version', () => {
  const before = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Twinkly.\n\n[Unreleased]: ${REPO}/commits/main\n`;
  const after = rollChangelog(before, '1.0.1', '2026-10-11');
  assert.match(
    after,
    /## \[Unreleased\]\n\n## \[1\.0\.1\] - 2026-10-11\n\n### Added\n\n- Twinkly\./,
  );
  assert.match(after, new RegExp(`\\[Unreleased\\]: ${REPO}/compare/v1\\.0\\.1\\.\\.\\.HEAD`));
  assert.match(after, new RegExp(`\\[1\\.0\\.1\\]: ${REPO}/releases/tag/v1\\.0\\.1`));
});

test('a later release compares with the previous tag', () => {
  const before = `## [Unreleased]\n\n- Fix.\n\n## [1.0.1] - 2026-10-11\n\n[Unreleased]: ${REPO}/compare/v1.0.1...HEAD\n`;
  const after = rollChangelog(before, '1.0.2', '2026-10-12');
  assert.match(after, new RegExp(`\\[1\\.0\\.2\\]: ${REPO}/compare/v1\\.0\\.1\\.\\.\\.v1\\.0\\.2`));
});

test('an empty Unreleased still names the version', () => {
  const after = rollChangelog(
    `## [Unreleased]\n\n[Unreleased]: ${REPO}/commits/main\n`,
    '1.1.0',
    'd',
  );
  assert.match(after, /## \[1\.1\.0\] - d\n\n- Maintenance release, no functional change\./);
});

test('a mention of the heading in the intro text is not the section', () => {
  // The 1.x release wrote its section inside the intro, which quotes the heading.
  const before =
    '# Changelog\n\nDescribe each change under `## [Unreleased]` as you make it.\n\n' +
    '## [Unreleased]\n\n### Added\n\n- Something new.\n\n' +
    '[Unreleased]: https://example.org/commits/main\n';
  const after = rollChangelog(before, '1.0.0', '2026-10-12');
  assert.match(after, /under `## \[Unreleased\]` as you make it\./);
  assert.match(after, /## \[1\.0\.0\] - 2026-10-12\n\n### Added\n\n- Something new\./);
});

test('a version already in the changelog is not written twice', () => {
  const before = '## [Unreleased]\n\n- Fix.\n\n[Unreleased]: https://example.org/commits/main\n';
  const once = rollChangelog(before, '1.0.0', '2026-10-12');
  assert.equal(rollChangelog(once, '1.0.0', '2026-10-13'), once);
});
