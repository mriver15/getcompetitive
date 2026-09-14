# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately to
**rivera.devs@gmail.com**. Do not open a public issue.

We will acknowledge your report within 5 business days and provide a timeline
for remediation. We appreciate responsible disclosure.

## Supported versions

| Version | Supported |
| ------- | --------- |
| latest  | ✅ |

## Scope

This is a local, read-only MCP data server using the stdio transport. It has no
network ingress and no persistence. The main security considerations are:

- the npm dependency chain (kept minimal: the MCP SDK, `@pkmn/dex`,
  `@smogon/calc`, and `zod`);
- untrusted input to tools, which is validated via zod schemas and confined to
  data lookups and calculations (no code execution, no filesystem/network
  access from tool inputs).
