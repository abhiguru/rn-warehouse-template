# Security Policy

## Supported Versions

Security fixes are provided for the latest release on the `main` branch.

## Reporting a Vulnerability

Please do not open a public issue for a suspected vulnerability. Use GitHub's
private vulnerability reporting for this repository. If that is unavailable,
contact the maintainer through the email address listed on their GitHub profile.

Include the affected version, reproduction steps, impact, and any suggested
mitigation. Please allow a reasonable amount of time for investigation before
public disclosure.

## Client Security Boundary

This application must use only a Supabase publishable or anonymous key. Never
ship a Supabase secret or service-role key, database credential, signing key, or
static CAPTCHA-bypass secret in a mobile build.
