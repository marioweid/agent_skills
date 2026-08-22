---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Fetch the latest guidelines from the source URL below
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the fetched guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

Fetch fresh guidelines before each review:

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

Use WebFetch to retrieve the latest rules. The fetched content contains all the rules and output format instructions. The URL above is the authoritative, always-current source — prefer it whenever the fetch succeeds.

## Local Fallback Checklist

If the fetch fails (offline, URL moved, network error), review against these core guideline points so the skill still produces value. Flag findings in the same `file:line` format. Note in your output that these are a local subset and the authoritative source could not be reached.

- **Accessibility**: every interactive element is keyboard-reachable with a visible focus state; images have `alt` text; form inputs have associated labels; color is never the only signal; sufficient contrast (WCAG AA).
- **Semantics**: use native elements (`button`, `a`, `nav`, `main`, headings in order) before ARIA; landmarks present; one `h1` per page.
- **Forms**: inputs have correct `type`/`autocomplete`/`inputmode`; validation errors are announced and tied to the field; submit is not disabled without explanation.
- **State & feedback**: loading, empty, and error states are handled; destructive actions confirm; interactive elements show hover/active/disabled states.
- **Responsiveness**: layout works from ~320px up; no horizontal scroll; touch targets ≥ 44px.
- **Motion**: respect `prefers-reduced-motion`; animations are short and non-blocking.
- **Performance**: images are sized and lazy-loaded; no layout shift (reserve space); avoid render-blocking work.

## Usage

When a user provides a file or pattern argument:
1. Fetch guidelines from the source URL above
2. Read the specified files
3. Apply all rules from the fetched guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.
