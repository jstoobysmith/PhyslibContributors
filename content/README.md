# Page text

The main blocks of text on the site, in Markdown, one file each. Edit them here;
no code needs to change. Settings and policy (sections, criteria, maintainers,
approval rules) are in `../config/` instead.

- **Formatting:** ordinary Markdown: `**bold**`, `*italic*`, `[links](https://…)`,
  lists, and a blank line between paragraphs. Links to pages of this site start
  with `/`, e.g. `[how a report is made](/about#process)`.
- **Placeholders:** `{name}` is replaced by a value from `config/`, so the text
  stays in step with the settings. The setup check (2.10) and the tests report
  any placeholder that does not exist.

| Placeholder | Value |
| --- | --- |
| `{siteTitle}` | the site's name, from `config/site.json` |
| `{reportSeries}` | the name of the report series |
| `{issuerName}` | the issuer's name, as it appears on reports |
| `{repository}` | this site's GitHub repository |
| `{physlibSite}`, `{physlibZulip}`, `{physlibGettingStarted}` | Physlib's website, Zulip channel and getting-started page |
| `{goodFirstIssues}` | Physlib's "good first issue" list |
| `{sectionPhrase}` | in `report/certifies.md` only: "the Review section" etc. |

Which file appears where:

| File | Where |
| --- | --- |
| `top-strip.md` | the strip above the header, on every page |
| `footer.md`, `footer-beta.md` | the bottom line of every page (the second while `"beta": true`) |
| `home/intro.md`, `home/new-to-physlib.md`, `home/new-to-physlib-note.md` | the home page |
| `about/*.md` | the About page (the approval rules, keys and links sections are generated from the code, so they always match it) |
| `submit/*.md` | the submission form |
| `verify/intro.md` | the verify page |
| `report/certifies.md`, `report/certifies-test.md` | the last line of "How this report was checked" on report pages |
