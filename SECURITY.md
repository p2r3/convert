# Security Policy

## Supported Versions

This project follows a rolling release model. Only the bleeding edge of the `master` branch is supported. If you are running an older commit, you are on your own. youre not a kool kid

| Version | Supported |
| :--- | :--- |
| `master` (latest) | :white_check_mark: |
| Anything else | :x: |
- - -
## Threat Model (Reality Check btw)

This is a 100% client-side, static browser application. There is no backend, no database, no user accounts, and no server-side state to compromise so idfk why youre reading this (thanks tho). 

Because all execution happens locally on your own machine, almost every "vulnerability" you might find is really just you hacking yourself. As such, the following are strictly out of scope:

- **Self-XSS:** Congratulations, you opened DevTools and ran JavaScript in your own browser. You have the qualifications to become a FAANG engineer and 9x your income.  
- **Denial of Service (DoS):** Feeding the app a 1TB malformed file to crash your own browser tab is NOT a CVE , its a hardware fricking benchmark pliz dont make a convert2shell site plz
- **Client-Side Tampering:** Modifying local memory, variables, or DOM elements to "bypass" features only affects your own screen... duh
- **Missing Security Headers:** If you are self hosting this, configuring your web server headers is your problem, not ours.

## What Actually Matters <---!!!

While the attack surface is roughly the size of a single millipixel (yes i just invented the term), we do take actual threats seriously. Please report anything involving:

- **Weaponized Input Files (XSS / ACE):** Crafting a malicious file that executes arbitrary JavaScript when opened by an unsuspecting victim. If someone shares a file and it steals another users session, mines crypto, or downloads a `sussy_sus.exe`... i suppose we care.
- **Browser Sandbox Escapes:** If you somehow manage to use this web app to break out of Chromium/Firefox and achieve RCE on the host OS, please DONT report it to Google or Mozilla first so we can do it first and actually get paid, we will let u know for the clout.
- **Supply Chain & Distribution Hijacks:** Compromised download links, hijacked domains, poisoned CDN scripts, or a rogue `npm` package suddenly deciding it wants to read `.ssh` keys like.. basically anything where the app is no longer serving the code we actually wrote.


- - -
## Reporting a Vulnerability

If you have found a legitimate, high-severity issue (specifically RCE/XSS via malicious input files or compromised distribution links), **do not open a public issue**. 

Instead, contact the maintainers directly:
**Maintainer:** contact@uwunya.org
**Project Owner:** p2r3@p2r3.com

For low-severity bugs, UI glitches, or questionable edge cases that don't actually threaten anyone, feel free to open a standard GitHub Issue. *or yk... might just be a skill issue*
