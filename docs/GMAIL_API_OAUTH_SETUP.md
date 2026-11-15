# Gmail API OAuth 2.0 for ScanWaste OTP

`gmail_api` sends OTP through HTTPS, not Gmail SMTP and not an App Password. It uses
only the `https://www.googleapis.com/auth/gmail.send` scope. The Mobile app does not
participate in this OAuth flow.

## Google Cloud setup

1. In Google Cloud Console, create/select the project owned by ScanWaste and enable
   **Gmail API**.
2. Configure OAuth consent screen. Choose **Internal** only for an eligible Google
   Workspace organization; otherwise choose **External**. Add the narrow `gmail.send`
   scope and the authorized ScanWaste owner as a test user while the app is Testing.
3. Create an OAuth client for the local bootstrap process. A Web client with an exact
   loopback redirect URI is suitable; never use the Android Mobile OAuth client. For
   example, register `http://127.0.0.1:53682/oauth2/callback` exactly, including path.
4. Run an Authorization Code flow **locally**. The authorization request must contain
   `response_type=code`, that exact `redirect_uri`, a cryptographically random `state`,
   `access_type=offline`, `prompt=consent`, the client ID, and only
   `scope=https://www.googleapis.com/auth/gmail.send`. Validate returned `state`
   before accepting the code.
5. Exchange the one-time code locally with HTTPS `POST https://oauth2.googleapis.com/token`
   using `grant_type=authorization_code`, client ID, client secret and the same redirect
   URI. Do not print or save the access token. Copy the refresh token directly into the
   Render secret field, then discard local callback/code data. Store no OAuth token in
   MongoDB or Git.
6. Set the sender Gmail address as `GMAIL_SENDER_EMAIL`. It must be the authorized
   account or an alias configured as **Send mail as** for that account.

The provider exchanges the refresh token for short-lived access tokens automatically
and caches only the access token in process memory. It does not request read, modify,
or full Gmail access.

## Render environment

Set these values in the **backend service** Environment page, never in Mobile:

| Variable | Value |
| --- | --- |
| `EMAIL_PROVIDER` | `gmail_api` |
| `GMAIL_OAUTH_CLIENT_ID` | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Refresh token with `gmail.send` grant |
| `GMAIL_SENDER_EMAIL` | Authorized Gmail/send-as address |
| `GMAIL_SENDER_NAME` | `ScanWaste` |
| `EMAIL_SEND_TIMEOUT_MS` | `10000` |

`GOOGLE_CLIENT_ID` is supported as a fallback only. Prefer
`GMAIL_OAUTH_CLIENT_ID`: the existing `GOOGLE_CLIENT_ID` may be used for social login
and is exposed by that public configuration endpoint. Keep `MONGODB_URI`, `REDIS_URL`,
`JWT_SECRET`, `OTP_SECRET`, and all existing production variables unchanged.

After setting the secrets, manually deploy the reviewed revision. Existing Render
services do not necessarily import changed Blueprint secrets automatically.

## Refresh-token lifetime and recovery

For an External consent screen in **Testing**, Google documents refresh tokens as
expiring after seven days when the requested scopes go beyond basic profile scopes;
`gmail.send` is a sensitive scope. Publishing to Production can remove that
testing-token expiry, but it does not prevent revocation, password/security changes,
or policy enforcement. Gmail scopes can require OAuth verification before broad public
use. Confirm the current requirements in Google Cloud before changing publishing status.

If the provider logs the safe category `invalid_grant_or_bad_request`, revoke/remove
the stale token in Render, repeat the local authorization flow with the owner account,
replace only `GOOGLE_REFRESH_TOKEN`, then redeploy. Do not request a new token per OTP.
A service account alone cannot send as a consumer Gmail account; Workspace
domain-wide delegation is relevant only when the organization administrator explicitly
authorizes it.

## Verification

After deployment, use one owner-approved test inbox and create one registration. A
successful Gmail API response (`id`) means **EMAIL_API_ACCEPTED**, not proof it reached
Inbox. Check Inbox/Spam, enter the OTP once, then test resend after the 60-second
cooldown. Never copy OTPs, refresh tokens, client secrets, or API responses into logs.
