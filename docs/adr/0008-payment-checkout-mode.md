# ADR-0008: Payment checkout mode (Razorpay Hosted/Standard Checkout first)

- **Status:** Accepted
- **Date:** 2026-11-23
- **Deciders:** Founders (approved 2026-11-23)

## Context

- ANDROID §4.14 and IOS §5.13/§6.6 say "launch Razorpay checkout" without fixing the integration mode.
- The native `react-native-razorpay` SDK needs an Expo development build/prebuild and a compatibility check against the chosen Expo SDK and iOS deployment target (IOS §6.6).
- A hosted/web checkout needs no native module, and it works the same on Android and iOS.
- Every spec requires a server-created provider order, a webhook-authoritative payment state, recovery after process death, and that client callbacks are never trusted (master §7; ARCH §8.4–§8.5).
- Physical goods must not use Apple In-App Purchase (IOS §6.8).

## Decision

1. **Release 1 uses Razorpay Hosted/Standard Checkout and is built first.**
   - `create-order` (or `resume-payment`) creates the Razorpay order on the server for the server-calculated amount, and issues a **short-lived, single-use, opaque checkout-session token**. The token is bound to the order, amount and customer, and expires no later than the reservation.
   - The app opens the SAMKRUSHI-hosted payment page (a public route on the approved domain, served from `apps/admin-web` unless a later ADR moves it) in the system or in-app browser through `expo-web-browser` (auth session / Custom Tabs / Safari view controller).
   - The page exchanges the token on the server, then loads Razorpay Standard Checkout with the public key ID and the server-created order ID. The page displays the server amount and holds no secrets.
   - On completion, failure or cancel, the page redirects to the app return link (Android App Link / iOS Universal Link, with a custom-scheme fallback). The return link, a browser dismissal or a cancel only triggers `get-order-status`.
2. **Authority:** only the verified `razorpay-webhook` (raw-body signature, provider order ID, amount, currency, captured event, unique event ID) or server-side provider status lookup during reconciliation may mark a payment captured. Signature data from the page callback may at most trigger an early server-side status check. Mismatches go to the payment exception queue (master §13.2).
3. **Recovery:** the app persists the idempotency key and pending order (master §13.3). `resume-payment` reissues a checkout session for an owned `pending_payment` order while its reservation is active, and never creates a new order. Reservation expiry checks provider state first (master §13.1).
4. **Native SDK later:** `react-native-razorpay` (or its successor) is a possible later enhancement. It sits behind a server-controlled `paymentCheckoutMode` flag in `get-app-config` and requires its own compatibility and security review. **Hosted Checkout remains the permanent fallback/backup path**: the server can switch clients back to hosted at any time, and hosted must stay tested in CI and E2E.
5. Razorpay secrets live only in Edge Function/server secrets. `RAZORPAY_KEY_ID` is used by the hosted page and the server, not the mobile bundle. No Apple IAP for produce orders.
6. Payment methods enabled in the Razorpay account, account activation/KYC, and the approved domain for the payment page and return links are founder decisions. Development uses Razorpay test mode only.

## Consequences

- No native payment module is needed for release 1. Android and iOS share one payment flow, and the Expo dev-client choice is not blocked by payments (EAS development builds still follow ADR-0009).
- A public hosted payment page must be built and secured: CSP, no secrets, token TTL, rate limits, and no PII in URLs. An approved HTTPS domain is needed for the page and verified links.
- The UX relies on a browser hand-off. Tests cover success, failure, cancel, dismissal, back press, backgrounding, process death, duplicate return and delayed webhooks on both platforms.
- Introducing the native SDK later is additive and reversible through the flag.

## References

- Master §4.3, §7, §8, §13.1–§13.3
- WEB_ADMIN §15
- ANDROID §4.14, §5.3, §6.4; IOS §5.13, §6.6, §6.8, §7.3
- ARCH §8.4–§8.5, §15.2, §16 (L1721) — status block
- ADR-0003 (envelope), ADR-0009 (mobile release configuration; authored separately)
