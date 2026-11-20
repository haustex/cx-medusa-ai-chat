# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.1.x | yes |

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Report it privately:

- through GitHub: **Security → Report a vulnerability** on
  [haustex/cx-medusa-ai-chat](https://github.com/haustex/cx-medusa-ai-chat/security), or
- by e-mail to [dev@hauskayu.com](mailto:dev@hauskayu.com), subject "Security: medusa-ai-chat".

Include the plugin and Medusa versions, what an attacker can do, and steps to reproduce. We will confirm that we
received the report, keep you updated while we fix it, and credit you in the release notes if you wish.

## Scope

Prompt-injection findings are in scope when they make the assistant break one of its hard rules in a way the guards
do not catch (an invented amount shown to the visitor, payment data requested, data of another session exposed).
Model hallucinations that the guard removes are expected behaviour, not vulnerabilities.
