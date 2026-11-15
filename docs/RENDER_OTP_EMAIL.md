# OTP email on Render

## Why production currently returns `EMAIL_NOT_CONFIGURED`

The production Blueprint previously had no email variables. The server defaults to
`EMAIL_PROVIDER=smtp`; with no `SMTP_HOST` and `SMTP_FROM`, it deliberately rejects
registration before issuing an OTP. This protects users from receiving a challenge
that cannot be completed.

Use the Gmail API OAuth provider over HTTPS for the Render service. Render Free blocks
outbound SMTP ports 25, 465 and 587, so SMTP is not a compatible transport there.
Brevo remains an HTTPS alternative; SMTP remains available for non-Render hosts.

## Required Render environment variables

Set these under **scanwaste-be > Environment**:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Existing production MongoDB connection string |
| `REDIS_URL` | Existing production Redis connection string |
| `JWT_SECRET` | Existing strong secret; do not rotate during this mail-only change |
| `OTP_SECRET` | Existing independent strong secret; do not rotate during this mail-only change |
| `EMAIL_PROVIDER` | `gmail_api` |
| `GMAIL_OAUTH_CLIENT_ID` | Gmail OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Gmail OAuth client secret (secret) |
| `GOOGLE_REFRESH_TOKEN` | Refresh token with only `gmail.send` scope (secret) |
| `GMAIL_SENDER_EMAIL` | Authorized Gmail or configured send-as alias |
| `GMAIL_SENDER_NAME` | `ScanWaste` |
| `EMAIL_SEND_TIMEOUT_MS` | `10000` |
| `OTP_TTL_SECONDS` | `300` |
| `OTP_RESEND_SECONDS` | `60` |

`GMAIL_OAUTH_CLIENT_ID` is intentionally separate from the existing social-login
`GOOGLE_CLIENT_ID`. `GOOGLE_CLIENT_ID` is a compatibility fallback only. Retain
`SOCIAL_PUBLIC_ORIGIN` and do not configure `SMTP_*` when `EMAIL_PROVIDER=gmail_api`.
See [GMAIL_API_OAUTH_SETUP.md](GMAIL_API_OAUTH_SETUP.md) for owner-only OAuth setup.

## Safe rollout and verification

1. In Google Cloud, enable Gmail API and obtain an OAuth refresh token through the
   owner-approved local authorization flow. Do not paste it in source control, issues,
   logs, or chat.
2. Add the variables above in the Render dashboard. The updated `render.yaml` records
   the non-secret Blueprint contract, but an existing service still needs its dashboard
   secrets configured.
3. Trigger a manual deploy of the reviewed commit. Do not rotate `JWT_SECRET` or
   `OTP_SECRET`, as that would invalidate active sessions or outstanding codes.
4. Check `GET /api/health` reports `database: connected` and inspect Render logs only
   for the safe `[OTP] Email delivery failed` event (it intentionally omits recipient,
   OTP, key and provider response body).
5. With an approved test inbox, submit one registration, receive the six-digit OTP,
   verify it once, then check that a replay fails. Test resend only after 60 seconds.

No production MongoDB data migration, bulk email, or deployment is performed by this
repository change.
