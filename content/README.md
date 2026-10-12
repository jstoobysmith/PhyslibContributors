# Page text

The main blocks of text on the site, in Markdown, one file each. Edit them here;
no code needs to change. Settings and policy (sections, criteria, maintainers,
approval rules) are in `../config/` instead.

Each file starts with a short header saying **where** its text appears on the
site and **what it should say** (GitHub shows it as a table when you open the
file). The header is not shown on the site; only the text below it is.

```markdown
---
where: >
  Home page: the paragraph at the top, above "Sections" …
purpose: >
  Introduces the site to a first-time visitor: … Two to four sentences.
---

**{siteTitle}** publishes short, citable reports …
```

The folders follow the site's pages: `home/`, `about/`, `submit/`, `verify/`
and `report/` (report pages); the files at the top (`top-strip.md`,
`footer.md`, `footer-beta.md`) appear on every page.

- **Formatting:** ordinary Markdown: `**bold**`, `*italic*`, `[links](https://…)`,
  lists, and a blank line between paragraphs. Links to pages of this site start
  with `/`, e.g. `[how a report is made](/about#process)`.
- **Placeholders:** `{name}` is replaced by a value from `config/`, so the text
  stays in step with the settings. The setup check (2.10) and the tests report
  any placeholder that does not exist, and any file without a header.

| Placeholder | Value |
| --- | --- |
| `{siteTitle}` | the site's name, from `config/site.json` |
| `{reportSeries}` | the name of the report series |
| `{issuerName}` | the issuer's name, as it appears on reports |
| `{repository}` | this site's GitHub repository |
| `{physlibSite}`, `{physlibZulip}`, `{physlibGettingStarted}` | Physlib's website, Zulip channel and getting-started page |
| `{goodFirstIssues}` | Physlib's "good first issue" list |
| `{sectionPhrase}` | in `report/certifies.md` only: "the Review section" etc. |

The approval rules, signatures and keys, link parameters and workflow diagram
on the About page are generated from the code, so they always match what it
does; they are not in this folder.
