# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue.

Use GitHub's private reporting form: <https://github.com/Gitguy268/convert/security/advisories/new>

Include what you found, how to reproduce it, and the browser and version you used. You should get a reply within a week. Please give the fix time to ship before you publish details.

## Scope

The converter runs in the browser, or in the Electron shell for the desktop build, and reads files you hand it. The most useful reports are about:

- a crafted input file that runs script, escapes the page or crashes the converter in a way that can be exploited;
- anything that sends a file or its contents off the device without you asking;
- the GitHub Actions workflows and the Docker setup in this repository.

## Supported versions

Only the latest version on the `master` branch is supported.
