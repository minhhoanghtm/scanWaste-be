# Gmail API OTP acceptance report

## Status

| Item | Status |
| --- | --- |
| IMPLEMENTED | Yes — `gmail_api` provider via HTTPS |
| TESTED | Yes — mocked Gmail/OAuth unit tests and OTP regressions |
| OAUTH_CONFIGURED | No — owner action required |
| DEPLOYED | No — intentionally not deployed |
| EMAIL_API_ACCEPTED | Not tested against Gmail |
| EMAIL_RECEIVED | Not tested against a real inbox |
| OTP_VERIFIED | Not tested in production |

## Implementation

`auth.mail.gmail-api.js` obtains an OAuth access token with a refresh token, sends a
UTF-8 MIME multipart text/HTML email to Gmail's `users/me/messages/send` endpoint, and
caches the short-lived access token only in process memory. The scope required for
bootstrap is `https://www.googleapis.com/auth/gmail.send`.

SMTP and Brevo remain unchanged. Missing Gmail configuration returns
`EMAIL_NOT_CONFIGURED`; failed OAuth/Gmail delivery returns
`EMAIL_DELIVERY_UNAVAILABLE`. Provider logs include only provider, random correlation
ID, operation, safe category, status and duration—never OTP, recipient, message,
access token, refresh token, client secret or API key.

## OTP/security regression

The existing registration/login/session suites verify HMAC storage, 300-second TTL,
60-second resend cooldown, five-attempt exhaustion, purpose binding, invalidation of a
previous OTP on resend, atomic one-time consumption, no premature user/session, and
Redis fail-closed rate limiting. The Gmail unit suite mocks OAuth and Gmail responses
for missing config, success, invalid grant, 400/401/403/429/5xx, timeout/network
failure, UTF-8 MIME and base64url encoding.

### Executed results

| Command | Result |
| --- | --- |
| `npm run test:unit` | Pass; includes 7 mail-provider tests and the AI temporary-artifact regression |
| `npm run test:auth` | Pass (10 tests) |
| `npm run test:social` | Pass (8 tests) |
| `node --test tests/integration/session-otp.test.js` | Pass (13 tests) |
| `node --test tests/integration/registration.test.js` | Pass (6 tests) |
| `node --test tests/integration/login-otp.test.js` | Pass (6 tests) |
| `npm run test:integration` | Environment-blocked: local `python` cannot import `uvicorn`; no production system was contacted |

The API integration suite starts a local Python AI service and is unrelated to Gmail
delivery. Install its requirements into the exact Python interpreter selected by
`PYTHON_BIN`, then rerun before release.

## Owner-required actions

Follow [GMAIL_API_OAUTH_SETUP.md](GMAIL_API_OAUTH_SETUP.md), set the Render secrets,
deploy the reviewed source revision, then authorize a single test recipient. No
production MongoDB changes, bulk email, credentials, commits, pushes or deployment
were performed by this implementation.

Mobile/APK source and configuration were not changed.
