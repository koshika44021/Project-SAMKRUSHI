# File 4: `SAMKRUSHI_IOS_APP_SPEC.md`

# SAMKRUSHI — iOS Customer Application Specification

Application: iOS customer application\
Monorepo location: `apps/mobile`\
Technology: Expo + React Native + TypeScript\
Version: 1.1 (amended 2026-11-23)\
Target market: Hyderabad, Telangana, India\
Depends on: `docs/specs/SAMKRUSHI_MASTER_MONOREPO_SPEC.md` (governs; ADR-0001)

## Amendments v1.1 — 2026-11-23

Founder-approved decisions of 2026-11-23 (see `docs/business-decisions.md`) were applied in place:

| Change | Sections | ADR |
|---|---|---|
| Release 1 targets Android first. The iOS build configuration is maintained and CI-built from master Phase 1, and the **iOS App Store release follows the Android release**. iOS keeps full feature parity | §1, §11, §12, §13 | ADR-0009 |
| Payments use Razorpay Hosted/Standard Checkout through `expo-web-browser` first. The native SDK may come later; hosted stays as the fallback. No Apple IAP for produce | §5.13, §6.6, §6.8, §7.3 | ADR-0008 |
| Server quote (`get-checkout-quote`) before order creation | §5.12 | ADR-0003 |
| Catalog availability is status + `maxOrderable` packs, never raw supply | §5.3, §5.6 | ADR-0003, ADR-0007 |
| New delivery-OTP display screen (master Phase 7) | §2.1, §5.21 | — |
| Refund states include `manual_review`. Timeline renders terminal/exception states | §5.16, §5.17 | — |
| Substitution option set is still an open founder decision | §5.18 | — |
| Address `locality`; lat/long optional and consent-gated; `save-address` serviceability check | §5.9 | — |
| Pending checkout recovery, guest cart revalidation, chunked/encrypted Keychain session storage | §5.7, §5.13, §6.7 | — |
| Implementation sequence mapped to master phases | §11 | ADR-0001 |

## 1. Purpose and architecture

The Samkrushi iOS application is the iOS release of the shared customer mobile application. Release 1 targets Android. The iOS build configuration is maintained in parallel from master Phase 1, and the iOS App Store release follows the Android release (ADR-0009).

It provides the same customer-facing functionality as Android:

- Product discovery.
- Serviceability checking.
- Product categories and search.
- Product details.
- Fixed-pack shopping.
- Cart.
- Customer authentication.
- Address management.
- Checkout.
- Payment.
- Order tracking.
- Order history.
- Customer support.
- Account deletion request.

Important architecture rule: The iOS and Android applications must not be maintained as separate business-logic projects. Both should use the same Expo React Native application and shared packages.

The platform-specific differences belong in navigation behavior, native integrations, permissions, secure storage, accessibility, testing and release configuration.

## 2. Application scope

### 2.1 First-release capabilities

1. Guest browsing.
2. PIN-code serviceability.
3. Home/catalog.
4. Product categories.
5. Search.
6. Product details.
7. Fixed-pack SKU selection.
8. Persistent shopping cart.
9. Customer login/authentication.
10. Profile and addresses.
11. Delivery-slot selection.
12. Checkout review.
13. Razorpay online payment (Hosted/Standard Checkout, ADR-0008).
14. Cash on Delivery when enabled by the backend.
15. Order confirmation.
16. Order history.
17. Order status/tracking.
18. Cancellation/refund request.
19. Substitution preference.
20. Customer support.
21. Push notifications.
22. Account deletion request.
23. Delivery OTP display for proof of delivery (§5.21; master Phase 7).

"First release" here means the first iOS store release, which follows the Android release 1 with the same feature set.

### 2.2 Deferred features

Do not implement these unless approved:

- Subscriptions.
- Loyalty programs.
- Referral campaigns.
- AI recommendations.
- Variable-weight post-payment settlement.
- Live GPS tracking.
- Automated route optimization.
- Farmer self-service.
- Multiple-city expansion.

## 3. Complete customer journey

\#chatgpt-mermaid-\_r_b1\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_b1\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_b1\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_b1\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_b1\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_b1\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_b1\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_b1\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_b1\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_b1\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_b1\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_b1\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_b1\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_b1\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_b1\_ p{margin:0;}#chatgpt-mermaid-\_r_b1\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_b1\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_b1\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_b1\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_b1\_ .label text,#chatgpt-mermaid-\_r_b1\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_b1\_ .node rect,#chatgpt-mermaid-\_r_b1\_ .node circle,#chatgpt-mermaid-\_r_b1\_ .node ellipse,#chatgpt-mermaid-\_r_b1\_ .node polygon,#chatgpt-mermaid-\_r_b1\_ .node path{fill:rgb(222, 234, 251);stroke:rgb(83, 154, 248);stroke-width:1px;}#chatgpt-mermaid-\_r_b1\_ .rough-node .label text,#chatgpt-mermaid-\_r_b1\_ .node .label text,#chatgpt-mermaid-\_r_b1\_ .image-shape .label,#chatgpt-mermaid-\_r_b1\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_b1\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_b1\_ .rough-node .label,#chatgpt-mermaid-\_r_b1\_ .node .label,#chatgpt-mermaid-\_r_b1\_ .image-shape .label,#chatgpt-mermaid-\_r_b1\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_b1\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_b1\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_b1\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_b1\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_b1\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_b1\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_b1\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_b1\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_b1\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_b1\_ .cluster rect{fill:rgb(243, 243, 243);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_b1\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_b1\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_b1\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(243, 243, 243);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_b1\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_b1\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_b1\_ .icon-shape,#chatgpt-mermaid-\_r_b1\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_b1\_ .icon-shape p,#chatgpt-mermaid-\_r_b1\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_b1\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_b1\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_b1\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_b1\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_b1\_ .node .neo-node{stroke:rgb(83, 154, 248);}#chatgpt-mermaid-\_r_b1\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_b1\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_b1\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_b1\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_b1\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_b1\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_b1\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_b1\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_b1\_ [data-look="neo"].node .neo-line path{stroke:rgb(83, 154, 248);filter:none;}#chatgpt-mermaid-\_r_b1\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_b1\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_b1\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_b1\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_b1\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_b1\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_b1\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_b1\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(0, 79, 153);}#chatgpt-mermaid-\_r_b1\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(0, 79, 153);}#chatgpt-mermaid-\_r_b1\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_b1\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_b1\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(245, 250, 255);stroke:rgb(206, 219, 229);stroke-width:1px;}#chatgpt-mermaid-\_r_b1\_ .node rect,#chatgpt-mermaid-\_r_b1\_ .node circle,#chatgpt-mermaid-\_r_b1\_ .node ellipse,#chatgpt-mermaid-\_r_b1\_ .node polygon,#chatgpt-mermaid-\_r_b1\_ .node path{fill:rgb(229, 243, 255);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_b1\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_b1\_ .mermaid-decision .label-container{fill:rgb(245, 250, 255);stroke:rgb(206, 219, 229);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_b1\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_b1\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_b1\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Open iOS AppPIN / ServiceabilityService Available?Show Unavailable StateHomeBrowse Category or SearchProduct DetailsAdd to CartCartSigned In?AuthenticateAddressDelivery SlotOrder ReviewCreate OrderPayment MethodRazorpay CheckoutCOD ValidationServer Payment VerificationOrder ConfirmedOrder StatusDeliverySupport / Order HistoryNoYesNoYesOnlineCOD

## 4. Navigation and screen structure

Use Expo Router.

The route structure should be shared with Android:

```
apps/mobile/
│
├── app/
│   ├── _layout.tsx
│   ├── index.tsx
│   │
│   ├── (public)/
│   │   ├── serviceability.tsx
│   │   ├── home.tsx
│   │   ├── search.tsx
│   │   ├── cart.tsx
│   │   ├── login.tsx
│   │   ├── otp.tsx
│   │   │
│   │   ├── category/
│   │   │   └── [categoryId].tsx
│   │   │
│   │   ├── product/
│   │   │   └── [productId].tsx
│   │   │
│   │   └── policies/
│   │
│   └── (customer)/
│       ├── _layout.tsx
│       │
│       ├── checkout/
│       │   ├── address.tsx
│       │   ├── slot.tsx
│       │   ├── review.tsx
│       │   ├── payment.tsx
│       │   └── confirmation/
│       │
│       ├── orders/
│       │
│       ├── account/
│       │   ├── profile.tsx
│       │   ├── addresses/
│       │   ├── preferences.tsx
│       │   └── delete-account.tsx
│       │
│       └── support/
│
├── components/
├── hooks/
├── services/
├── store/
├── constants/
├── assets/
├── types/
└── utils/
```

Do not create separate Android and iOS implementations for common screens.

## 5. Screen-by-screen functional specification

### 5.1 Splash and session restoration

Purpose: initialize the app and restore a customer session.

Requirements:

- Display approved Samkrushi logo.
- Restore authentication securely (chunked/encrypted Keychain-backed storage; §6.7, master §13.5).
- Load application configuration (`get-app-config`: customer-safe settings, support contacts, policy links, feature flags, minimum supported app version).
- Check for a persisted pending checkout and reconcile it (§5.13, master §13.3).
- Restore previously selected PIN/address context.
- Handle offline/network failure states.
- Allow browsing without login.
- Avoid unnecessary delays during app initialization.

### 5.2 Serviceability

Customer should be able to enter a PIN code or select an existing address.

Backend checks:

- PIN-code mapping.
- Active service zone.
- Whether the zone is temporarily suspended.
- Available delivery dates and slots.

Display clear serviceable/not-serviceable information.

Manual PIN entry is the baseline. Do not require precise GPS location for launch unless an approved feature needs it.

### 5.3 Home page

Suggested sections:

1. Header with Samkrushi brand.
2. Selected PIN/address.
3. Search field.
4. Product category shortcuts.
5. Featured products, where configured.
6. Product listing.
7. Delivery information.
8. Cart shortcut.
9. Account shortcut.

Product cards must show:

- Product image.
- Product name.
- Pack size.
- Unit.
- Price.
- Availability status (`available`, `limited` or `unavailable`, mapped to display labels).

All product information comes from the backend (`get-catalog` Edge Function). It returns status and a server-computed `maxOrderable` pack count per SKU from the shared availability function. Raw farmer-supply quantities are never returned or derived. Quantities are decimal strings, and prices are integer paise (ADR-0003).

Do not display procurement cost, private supplier information or internal operational notes.

### 5.4 Category screen

Requirements:

- Category title.
- Product listing.
- Product images.
- Pack sizes.
- Price.
- Availability.
- Loading/empty/error states.
- Pagination or incremental loading.
- Server-supported filter and sort behavior.

The admin dashboard controls product and category availability.

### 5.5 Search

Provide search by product/category name.

Requirements:

- Debounced search requests (`get-catalog` with a `q` parameter; server-side matching).
- Cancel or ignore stale search requests.
- Search result list.
- Clear action.
- No-results message.
- Network recovery.
- Offline cached results marked stale.

### 5.6 Product details

Display:

- Product name.
- Product description.
- Images.
- Fixed-pack SKU options.
- Price.
- Unit.
- Business-date availability per SKU (status + `maxOrderable`, from `get-product-detail`).

Customers choose a pack and quantity. Quantity controls follow the SKU's min/max/step (in packs) and never exceed `maxOrderable`. Each SKU is a fixed pack of the product's base unit, and all SKUs of a product share one availability pool (ADR-0006).

Example display:

| Product   | Available pack |
| --------- | -------------- |
| Product A | 500 g          |
| Product A | 1 kg           |

Actual values come from the catalog and are not hard-coded.

Do not invent nutrition or quality claims. Any product statements must be verified and approved.

### 5.7 Cart

Display:

- Product.
- Pack size.
- Quantity.
- Unit price.
- Line total.
- Subtotal.
- Remove/edit actions.

Requirements:

- Cart persists locally.
- Cart survives app restart and authentication.
- Guest users can use the cart.
- Cart is not a reservation.
- Checkout revalidates stock, SKU and price.
- Stale cart items receive clear error messages. After login, and before the quote, every line is revalidated. Lines are flagged, never silently dropped or changed (master §13.4).

### 5.8 Authentication

Use the configured Supabase Auth flow. The customer authentication method is an open founder decision (master Phase 5). Phone OTP needs a paid SMS provider and India DLT registration. Any third-party social login would trigger the Sign in with Apple requirement. Customer sign-up never grants staff access (ADR-0005).

If phone OTP is selected:

1. Customer enters phone.
2. Validate phone input.
3. Request OTP.
4. Customer enters verification code.
5. Verify OTP.
6. Restore authenticated session.
7. Return to the checkout flow.

Protect against OTP abuse with resend cooldown and attempt limits. Never log OTP or credentials.

### 5.9 Profile and address management

Address fields:

- Recipient name.
- Contact number.
- Address lines.
- Landmark.
- Locality.
- City.
- State.
- PIN code.
- Address label.
- Default-address flag.

Customer can create, update and delete their own addresses where business rules allow. Delete is a soft archive (`archive-address`). Orders keep their address snapshot, and the rule for addresses on active orders is a founder decision.

Backend must verify ownership and serviceability. `save-address` (Edge Function) creates, updates and sets the default, and runs the server serviceability check. The address list is read RLS-direct. Latitude/longitude stay empty unless an approved feature needs them and the customer consents.

### 5.10 Checkout — address

Customer selects or creates an address.

The server checks serviceability again. Do not rely exclusively on the PIN entered at initial app launch.

If the selected address is outside the active zone, prevent checkout and explain why.

### 5.11 Checkout — delivery slot

Backend returns delivery slots.

Each slot should have:

- Delivery date.
- Start time.
- End time.
- Capacity state.
- Cutoff.

The initial operating model may target early-morning delivery, but the application must display the configured time rather than a hard-coded time.

Rules:

- Server time decides eligibility.
- Use `Asia/Kolkata` for business dates.
- Slot selection is provisional.
- Slot capacity is reserved transactionally during order creation.
- Refresh when slot availability changes.

### 5.12 Checkout — order review

Display:

- Address.
- Delivery slot.
- Products and fixed packs.
- Quantity and unit.
- Subtotal.
- Discount, when valid.
- Delivery fee.
- Tax components, when configured.
- Final payable total.
- Payment method.
- Substitution preference.
- Cancellation/refund and delivery information.

All final amounts are backend-calculated. The app must not independently calculate an authoritative amount. The review screen renders `get-checkout-quote` (lines, subtotal, discounts, delivery fee, taxes, total, COD eligibility, availability/slot issues, quote reference). The quote reserves nothing. If the quote, or a quote-changed error from `create-order`, reports changes, explain them and ask the customer to review again.

### 5.13 Payment

Online payment flow:

1. App persists the idempotency key and quote reference locally, then submits the order intent (cart lines, address, slot, payment method, preferences, quote reference, idempotency key) to `create-order`.
2. Server validates the order.
3. Server reserves stock and slot transactionally.
4. Server creates internal order.
5. Server creates the Razorpay order and returns a short-lived hosted-checkout session.
6. App opens the hosted payment page (Razorpay Hosted/Standard Checkout, release 1 path, ADR-0008) through `expo-web-browser` (an authentication session / Safari view controller).
7. The page redirects to the app's return link (Universal Link, with a custom-scheme fallback), or the customer dismisses the browser. Either way, control returns to the app with no authority over payment state.
8. App queries backend (`get-order-status`).
9. Backend verifies the provider webhook and captured payment, or resolves it through server-side provider reconciliation.
10. App displays authoritative payment/order state. While the reservation is active, a pending order can reopen payment through `resume-payment`. This never creates a new order.

The native `react-native-razorpay` SDK is a possible later enhancement behind a server-controlled checkout-mode flag. Hosted Checkout remains the permanent fallback.

Do not treat client callback as proof of payment.

If app is suspended, terminated or loses network during payment, restore the pending order and reconcile with backend. Do not create another order automatically. The persisted pending-checkout record (`idempotencyKey`, `quoteReference`, `orderId`, `sessionExpiresAt`; no payment data) is reconciled on launch and resume (master §13.3).

COD:

- Show only when permitted by backend policy.
- Backend validates zone, slot, order amount and COD eligibility.
- Display amount due at delivery.

### 5.14 Order confirmation

Display:

- Order number.
- Product details.
- Quantity and pack sizes.
- Address summary.
- Delivery date and slot.
- Final amount.
- Payment status.
- Order status.

Only show paid/confirmed when supported by server state.

### 5.15 Order history

Categories:

- Active.
- Completed.
- Cancelled.

Each order card should include order number, date, amount and state. The list is read RLS-direct from the customer's own order-summary view.

### 5.16 Order details and tracking

Show server-derived status timeline:

```
Order placed
    ↓
Payment confirmed / COD confirmed
    ↓
Processing
    ↓
Picking and packing
    ↓
Packed
    ↓
Out for delivery
    ↓
Delivered
```

The initial release can use status milestones instead of live GPS. `get-order-status` derives the timeline on the server from order, payment and fulfilment history. The UI must also render `cancelled`, `delivery_failed`, `returned` and refund states.

### 5.17 Cancellation and refunds

Requirements:

- Display eligible cancellation action (`cancellationEligibility` from `get-order-status`, computed on the server).
- Collect reason.
- Submit cancellation request to backend (`request-order-cancellation`).
- Display whether it needs staff approval.
- Show refund status separately, using the approved labels: `requested` → "Refund request received"; `pending` and `manual_review` → "Refund is being processed"; `processed` → "Refund completed"; `failed` → "Refund could not be processed" (`cancelled` label still open). The display mapping lives in `packages/shared`.
- Do not call refund complete before payment provider confirmation.

### 5.18 Substitution

Use the approved substitution policy.

Possible preference options:

- Do not substitute.
- Allow approved replacement.
- Contact customer before substitution, if supported.

The option set is an **open founder decision**, because "allow similar" and "approved replacement" carry different consent semantics. Render only the options the backend enables. The dev default enables only `no_substitution`.

Do not silently substitute. Any replacement with a different paid amount must use an approved payment/refund process.

### 5.19 Customer support

Support features:

- Help categories.
- Configured support contact details.
- Create ticket.
- Link ticket to order.
- Issue description.
- Optional permitted photo attachment.
- Ticket status.
- Customer-visible replies.

Transports: `create-support-ticket` and `add-support-message` (Edge Functions; ownership checks and rate limits); attachments through `create-upload-url` to private storage; list/detail and public replies read RLS-direct from a customer view.

Internal staff notes must remain private.

### 5.20 Account deletion

Provide an authenticated account-deletion request.

Requirements:

- Recent authentication where appropriate.
- Submit deletion request.
- Show request status.
- Follow approved retention/anonymization process.
- Explain that certain records may require retention only using founder/legal-approved wording.
- Uses `request-account-deletion`. The public web page `/delete-account` is the fallback that store review requires (master §13.8).

### 5.21 Delivery OTP display (master Phase 7)

- On an owned order in an eligible delivery state, order details offers "Show delivery code" through `get-delivery-otp`. The server issues a single-use code, stores it encrypted (ADR-0010), returns the same code on every view until used/expired/revoked, and returns the plaintext only to the authenticated owner.
- Display the code large, VoiceOver-readable and Dynamic Type-safe, with an instruction to share it only with the assigned rider at handover.
- Re-requesting is rate-limited and invalidates the previous code.
- Never include the code in push notifications, lock-screen text, logs or analytics. Do not cache it beyond the screen session.
- Refresh order state from `get-order-status` after delivery.
- Additional channels and the code length/expiry are founder decisions held as server settings.

## 6. iOS-specific design and technical requirements

### 6.1 Native layout and safe areas

The iOS experience must account for:

- Status bar.
- Notch/Dynamic Island.
- Safe-area insets.
- Home indicator.
- Keyboard.
- Device screen sizes.

Use safe-area-aware layouts.

Do not allow important checkout buttons or input fields to appear under system interface elements.

### 6.2 Navigation

- Use native-feeling transitions.
- Support interactive swipe-back navigation.
- Preserve cart and form state.
- Do not discard checkout details when returning from payment.
- Use sheets for short contextual choices where appropriate.
- Do not place critical checkout state in a dismissible sheet.

### 6.3 Permission handling

Avoid requesting unnecessary permissions.

Do not request location, contacts, photos or notifications at first launch without a clear contextual need.

For launch:

- Manual PIN entry should be sufficient for serviceability.
- Use the system photo picker for optional support attachments where appropriate.
- Ask for notification permission after explaining the benefit.
- Handle denied notifications gracefully.

### 6.4 Push notifications

Use Expo Notifications initially.

Potential events:

- Order confirmed.
- Payment state update.
- Packing started/packed.
- Out for delivery.
- Delivered.
- Cancellation/refund update.
- Support reply.

Requirements:

- Store push token and platform (`register-push-token`).
- Handle token refresh.
- Remove invalid or revoked tokens (`revoke-push-token` on logout or permission loss).
- Never include delivery OTPs or sensitive details in payloads.
- Deep-link notification tap to the relevant order.
- Restore authentication before showing protected order content.
- Always retrieve latest server state after opening.

Push notifications are not the system of record.

### 6.5 Universal Links

Configure verified iOS Universal Links for the approved Samkrushi domain (`apple-app-site-association` hosted there; the domain is a founder decision). Keep a custom-scheme fallback for the hosted-checkout return.

Potential uses:

- Opening an order.
- Opening a notification destination.
- Returning from supported payment flows.
- Opening public policy/support pages.

Every protected route must still verify customer ownership.

### 6.6 Razorpay and app lifecycle

Payment flows must be tested when the application is:

- In the foreground.
- In the background.
- Suspended.
- Terminated.
- Reopened after network failure.

Requirements:

- Restore pending order.
- Query backend payment state.
- Handle duplicate callback.
- Handle delayed webhook.
- Do not create duplicate orders.
- Do not assume payment failed when app closes or the browser sheet is dismissed.

Release 1 uses Hosted/Standard Checkout through `expo-web-browser`, which needs no native payment module (ADR-0008). Before adopting the native Razorpay SDK later, check compatibility between the chosen Expo SDK, iOS deployment target and that SDK.

### 6.7 Secure storage

Use an approved, maintained Expo-compatible Keychain-backed secure-storage solution for sensitive session material, subject to Supabase SDK requirements. Supabase sessions may exceed secure-store value-size limits. Use a chunked or encrypted large-session adapter: the key lives in the Keychain, and the ciphertext lives in app storage (master §13.5).

Never store:

- Supabase service-role key.
- Razorpay secret.
- Webhook secret.
- R2 secret credentials.
- Private notification provider credentials.

Never log sensitive authentication material.

### 6.8 App payment policy

Samkrushi sells physical produce and delivery.

Use the approved payment provider for those physical goods (Razorpay Hosted/Standard Checkout, ADR-0008). Do not implement Apple In-App Purchase as the payment mechanism for produce orders.

Verify the current App Store payment and review rules before submission.

### 6.9 Accessibility

Support:

- VoiceOver labels and logical reading order.
- Dynamic Type.
- Large text without clipping.
- Adequate contrast.
- Non-color-only order status.
- Accessible controls.
- Form error announcements.
- Comfortable touch targets.
- Reduced Motion preferences.

## 7. State management and shared data

### 7.1 Server state

Backend owns:

- Products and categories.
- SKUs and pack sizes.
- Prices.
- Tax.
- Delivery charges.
- Serviceability.
- Delivery slots.
- Stock and reservations.
- Orders.
- Payment state.
- Refund state.
- Cancellation eligibility.
- Support and account deletion state.

### 7.2 Local state

Client owns:

- Navigation.
- UI state.
- Search input.
- Cached public catalog.
- Cart draft.
- Display preferences.

### 7.3 Recommended libraries

| Responsibility   | Recommendation                   |
| ---------------- | -------------------------------- |
| Navigation       | Expo Router                      |
| Server state     | TanStack Query                   |
| Local/cart state | Zustand                          |
| Validation       | Zod                              |
| Forms            | React Hook Form                  |
| Authentication   | Supabase Auth                    |
| Secure storage   | Keychain-backed `expo-secure-store` with a chunked/encrypted large-session adapter |
| Notifications    | Expo Notifications               |
| Payment          | Razorpay Hosted/Standard Checkout through `expo-web-browser` (ADR-0008); native SDK later |

### 7.4 Offline behavior

- Cached catalog is stale.
- Cart edits may remain local.
- Checkout requires network access.
- Never queue payments blindly.
- Reconcile existing pending orders after network recovery.

## 8. Loading, error and empty states

Every remote-data screen must support:

- Loading.
- Empty.
- Error.
- Retry.
- Success.
- Offline/stale status.

Avoid misleading payment messages.

For an ambiguous payment result, display a message that the payment/order is being checked and provide a route to the order status screen.

Do not state that the order failed merely because the app lost connection.

## 9. Security requirements

- Backend authorization for every protected API.
- Database RLS enforcement.
- Customer can read only their own records.
- Server-side price and stock calculations.
- Secure session storage.
- No provider secrets in mobile bundles.
- HTTPS in production.
- Input validation.
- No sensitive information in logs.
- Account deletion must be authenticated.
- Push tokens and customer data must be handled according to approved privacy policy.

## 10. iOS acceptance criteria

1. Guest browsing works without sign-in.
2. PIN/serviceability is verified by backend.
3. Product catalog is backend-driven.
4. Product pack size, unit and price are displayed clearly.
5. Cart persists across restart and authentication.
6. Checkout revalidates price, stock, address and slot.
7. Concurrent checkout cannot oversell or overbook.
8. Duplicate order requests are idempotent.
9. Client callback cannot mark payment successful.
10. Duplicate/delayed webhook is safely reconciled.
11. App termination during payment restores correct order state.
12. COD appears only when permitted.
13. Customer can access only their own records.
14. Cancellation and refund state comes from backend.
15. Universal Links and notification navigation work.
16. Account deletion request is authenticated and traceable.
17. Offline catalog is marked stale.
18. VoiceOver and Dynamic Type pass.
19. Safe areas, keyboard and swipe-back behavior pass.
20. Permission and privacy disclosures match the actual application behavior.
21. Review totals come from `get-checkout-quote`. A changed quote is re-reviewed before ordering.
22. Hosted-checkout return or dismissal never marks an order paid or failed; only server state does.
23. The delivery OTP is visible only to the order owner, never in notifications.
24. Catalog shows availability status and `maxOrderable` only, never raw supply quantities.

## 11. iOS implementation sequence

These are sub-steps, not a separate phase numbering. Master phases govern (ADR-0001). Each iOS step ships from the same code as its Android counterpart and is verified on iOS builds in CI and on simulators or devices. Only the App Store submission waits for the Android release.

| Step | Work                                               | Master phase |
| ---- | -------------------------------------------------- | ------------ |
| 1    | Shared Expo foundation and iOS build configuration | 1            |
| 2    | Authentication and session restore                 | 5            |
| 3    | Serviceability and catalog                         | 5            |
| 4    | Search, categories and product details             | 5            |
| 5    | Cart and persistence                               | 5            |
| 6    | Profile and address management                     | 5            |
| 7    | Delivery slots and checkout (quote)                | 5 (slots), 6 |
| 8    | Razorpay Hosted Checkout/COD and pending checkout recovery | 6    |
| 9    | Order confirmation, history and tracking           | 6, 8         |
| 9a   | Delivery OTP display                               | 7            |
| 10   | Support, cancellation and account deletion         | 8            |
| 11   | Push notifications and Universal Links             | 9            |
| 12   | iOS accessibility, security and release validation | 9 (store release after Android release 1) |

The Android and iOS builds must reuse the same application logic and shared API contracts.

## 12. App Store release checklist

App Store submission follows the Android release 1 (ADR-0009). The iOS release configuration (bundle identifier variants in `app.config.ts`, EAS build/submit profiles, APNs key, associated domains) is maintained from master Phase 1. Apple Developer account ownership and signing custody are founder decisions.

Before submitting:

- Confirm bundle identifier.
- Confirm approved app name and branding.
- Prepare app icons and launch assets.
- Verify current Expo/React Native/`expo-web-browser` compatibility, and the Razorpay native SDK too if it has been adopted.
- Configure Apple Developer signing and provisioning securely.
- Configure Universal Links.
- Test TestFlight build on physical iPhones.
- Test supported iOS versions and screen sizes.
- Prepare accurate App Privacy disclosures.
- Provide privacy-policy URL.
- Include the approved in-app account-deletion pathway.
- Prepare screenshots and App Store description.
- Provide support URL and review information.
- Verify current App Store payment and review requirements.
- Verify production Supabase environment, RLS and payment webhooks before live ordering.

## 13. Definition of done

The iOS app is ready for its pilot store release, which follows the Android release 1, when:

- Every launch customer journey works.
- Mobile logic is shared with Android.
- Backend remains the source of truth.
- Authentication and customer-data isolation are tested.
- Checkout, payment and payment recovery pass.
- Stock and slot concurrency tests pass.
- Push notifications are functional but not required for order correctness.
- Universal Links work.
- VoiceOver and Dynamic Type pass.
- Safe-area and keyboard behavior pass.
- TestFlight build has been tested on real devices.
- Privacy and App Store release requirements have been reviewed.

