# ADR-0010: Re-viewable delivery OTP storage

- **Status:** Accepted
- **Date:** 2026-11-23
- **Deciders:** Founders (customers can view the same OTP again) and engineering (storage design)

## Context

The v1.1 master §13.6 stored only a **hash** of the delivery OTP. With hash-only storage, "Show delivery code" can't redisplay a code, so each view issues a new one. The founders decided the customer must be able to **view the same OTP again** until it is used or expires.

## Decision

1. **Encrypted at rest, not hashed only.**
   - `delivery_otps` stores the code encrypted with authenticated symmetric encryption (`pgcrypto` `pgp_sym_encrypt`, AES-256).
   - The key lives in **Supabase Vault** (or an Edge Function secret) and never in a migration, seed, repository or client bundle.
   - A keyed HMAC of the code is also stored, so verification never needs decryption.
2. **Viewing.** `get-delivery-otp` decrypts and returns the **same** active code to the authenticated order owner, as often as needed (rate-limited), until it is used, expires or is revoked. Each view is recorded (count and last-viewed time). The code is never logged.
3. **Verification.** `confirm-delivery-otp` (assigned rider only) compares the HMAC in constant time. Attempts are counted, and the code locks after the configured attempt limit. A successful match marks it `used` (single-use) in the same transaction that records delivery.
4. **New codes only on explicit events.** A new code is issued after expiry, lockout, staff revocation, or rider reassignment if the founders' policy requires it. Issuing a new code revokes the previous one.
5. **Exposure rules (unchanged).** The OTP never appears in push payloads, lock-screen text, logs, audit `before`/`after` values or any API response other than `get-delivery-otp` to the owner. Riders and staff can't read it.
6. **Open founder settings.** OTP length, expiry and attempt limits, and any extra channel (such as SMS), are configurable settings. The dev placeholder is 6 digits.

## Consequences

- A database compromise without the Vault key does not reveal codes. Vault key handling and rotation get a runbook in Phase 7.
- Phase 7 tests cover:
  - the same code returned on repeat views;
  - single use;
  - expiry;
  - attempt lockout;
  - revocation on re-issue;
  - rider-only verification;
  - no plaintext in logs or audit.

## References

- Master §4.5, §13.6; ANDROID §4.22; IOS §5.21
- Supersedes the "stores only its hash" wording in v1.1 master §13.6 and the mobile specs, and ARCH L1218 / L1494
