# Security policy

Target Copy handles potentially private notes and clipboard content. Security
and privacy reports are taken seriously.

## Supported versions

Security fixes are provided for the latest released version. Users should
update to the newest release before reporting an issue that may already be
resolved.

## Reporting a vulnerability

Use GitHub's **Security → Report a vulnerability** flow for the repository.
Do not disclose a vulnerability, private note, vault path, or proof-of-concept
payload in a public issue.

If private vulnerability reporting is unavailable, open a public issue that
only asks the maintainer to establish a private contact channel. Do not include
sensitive technical details in that issue.

Include:

- affected Target Copy and Obsidian versions;
- operating system;
- minimal reproduction steps using synthetic content;
- security or privacy impact;
- whether the issue is already public;
- any suggested mitigation.

The maintainer will acknowledge a report, investigate it, coordinate a fix, and
credit the reporter if requested and appropriate. No response or resolution
deadline is guaranteed.

## Security boundaries

Target Copy is designed to:

- process content locally;
- avoid network requests, accounts, telemetry, and remote configuration;
- write to the clipboard without reading existing clipboard contents;
- read only explicitly copied notes and referenced local images;
- keep executable source inert during conversion;
- avoid logging note or image content.

Destination applications and other installed Obsidian plugins are outside
Target Copy's security boundary.
