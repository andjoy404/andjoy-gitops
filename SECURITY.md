# Security Policy

## Supported versions

Security fixes are applied to the latest code on the default branch. The project does not currently publish a long-term support matrix.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Use GitHub's **Report a vulnerability** option in the repository Security tab. Include:

- the affected version or commit;
- reproduction steps or a proof of concept;
- the security impact;
- any suggested mitigation.

You should receive an acknowledgement after the report is reviewed. Please allow time for investigation and coordinated remediation before public disclosure.

## Security-sensitive configuration

- Never commit GitLab access tokens, session secrets, passwords, or encryption keys.
- Use a stable, strong `APP_ENCRYPTION_KEY`; changing it prevents existing encrypted GitLab tokens from being decrypted.
- Rotate any credential that may have been exposed.
- Restrict GitLab tokens to the minimum scopes and permissions required for the monitored groups.
- Run AndJoy GitOps behind TLS and an authenticated reverse proxy when exposed beyond a trusted network.
