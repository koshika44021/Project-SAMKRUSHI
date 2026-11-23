One important architecture decision: Android and iOS will have separate build and release configurations, but both should use the same Expo React Native mobile codebase inside the monorepo. This avoids maintaining the same business logic twice.

# File 3: `SAMKRUSHI_ANDROID_APP_SPEC.md`

# SAMKRUSHI — Android Customer Application Specification

Application: Android customer application\
Monorepo location: `apps/mobile`\
Technology: Expo + React Native + TypeScript\
Version: 1.1 (amended 2026-11-23)\
Target market: Hyderabad, Telangana, India\
Depends on: `docs/specs/SAMKRUSHI_MASTER_MONOREPO_SPEC.md` (governs; ADR-0001)

## Amendments v1.1 — 2026-11-23

Founder-approved decisions of 2026-11-23 (see `docs/business-decisions.md`) were applied in place:

| Change | Sections | ADR |
|---|---|---|
| Android is the **release 1** platform. iOS build config is maintained in parallel; the iOS store release follows | §1, §6.6, §11 | ADR-0009 |
| Payments use Razorpay Hosted/Standard Checkout through `expo-web-browser` first. The native SDK may come later; hosted stays as the fallback | §4.14, §5.3, §6.4 | ADR-0008 |
| Server quote (`get-checkout-quote`) before order creation | §4.13 | ADR-0003 |
| Catalog availability is status + `maxOrderable` packs, never raw supply. Quantities are decimal strings | §4.3, §4.6 | ADR-0003, ADR-0007 |
| Customer operation transports (Edge Function vs RLS-direct) named per screen | §4 | ADR-0003 |
| New delivery-OTP display screen (master Phase 7) | §1.1, §4.22 | — |
| Refund states include `manual_review`. Timeline renders terminal/exception states | §4.17, §4.18 | — |
| Substitution option set is still an open founder decision | §4.19 | — |
| Address `locality`; lat/long optional and consent-gated; server serviceability via `save-address` | §4.10 | — |
| Pending checkout recovery, guest cart revalidation, chunked/encrypted secure session storage | §4.7, §4.14, §5.3, §5.4 | — |
| Implementation sequence mapped to master phases | §10 | ADR-0001 |

## 1. Purpose and application scope

The Samkrushi Android application is the primary customer-facing shopping platform. Android is the **release 1** platform (ADR-0009). The same shared Expo codebase also produces the iOS build, whose store release follows Android.

Customers should be able to discover fresh produce, check whether Samkrushi delivers to their location, browse available products, select fixed packs, add products to a cart, place orders, make payments, track deliveries and contact customer support.

The application must connect to the same backend and database used by the Samkrushi web admin dashboard.

### 1.1 Launch features

The first customer-facing release must include:

1. Guest browsing.
2. PIN-code and delivery-serviceability checking.
3. Home page and product catalog.
4. Product categories.
5. Product search.
6. Product details.
7. Fixed-pack product selection.
8. Shopping cart.
9. Customer authentication.
10. Customer profile.
11. Address management.
12. Delivery-date and slot selection.
13. Checkout.
14. Razorpay online payments (Hosted/Standard Checkout, ADR-0008).
15. Cash on Delivery, only when enabled by business rules.
16. Order confirmation.
17. Order history.
18. Order tracking.
19. Cancellation and refund requests.
20. Customer support.
21. Push notifications.
22. Account deletion request.
23. Delivery OTP display for proof of delivery (§4.22; master Phase 7).

### 1.2 Features deferred from the first release

Do not implement these unless separately approved:

- Subscription boxes.
- Loyalty points.
- Referral programs.
- Complex coupon systems.
- AI-powered product recommendations.
- Demand forecasting.
- Variable-weight checkout with post-payment price adjustments.
- Live rider GPS tracking.
- Automated delivery-route optimization.
- Farmer self-service portal.
- Multiple-city operations.

The architecture should allow future expansion without making these features prerequisites for the first release.

## 2. Overall customer journey

The complete customer journey should follow this flow:

\#chatgpt-mermaid-\_r_ai\_{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;fill:rgb(13, 13, 13);}@keyframes edge-animation-frame{from{stroke-dashoffset:0;}}@keyframes dash{to{stroke-dashoffset:0;}}#chatgpt-mermaid-\_r_ai\_ .edge-animation-slow{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 50s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_ai\_ .edge-animation-fast{stroke-dasharray:9,5!important;stroke-dashoffset:900;animation:dash 20s linear infinite;stroke-linecap:round;}#chatgpt-mermaid-\_r_ai\_ .error-icon{fill:rgb(243, 243, 243);}#chatgpt-mermaid-\_r_ai\_ .error-text{fill:rgb(13, 13, 13);stroke:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ai\_ .edge-thickness-normal{stroke-width:1px;}#chatgpt-mermaid-\_r_ai\_ .edge-thickness-thick{stroke-width:3.5px;}#chatgpt-mermaid-\_r_ai\_ .edge-pattern-solid{stroke-dasharray:0;}#chatgpt-mermaid-\_r_ai\_ .edge-thickness-invisible{stroke-width:0;fill:none;}#chatgpt-mermaid-\_r_ai\_ .edge-pattern-dashed{stroke-dasharray:3;}#chatgpt-mermaid-\_r_ai\_ .edge-pattern-dotted{stroke-dasharray:2;}#chatgpt-mermaid-\_r_ai\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_ai\_ .marker.cross{stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_ai\_ svg{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:16px;}#chatgpt-mermaid-\_r_ai\_ p{margin:0;}#chatgpt-mermaid-\_r_ai\_ .label{font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ai\_ .cluster-label text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ai\_ .cluster-label span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ai\_ .cluster-label span p{background-color:transparent;}#chatgpt-mermaid-\_r_ai\_ .label text,#chatgpt-mermaid-\_r_ai\_ span{fill:rgb(13, 13, 13);color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ai\_ .node rect,#chatgpt-mermaid-\_r_ai\_ .node circle,#chatgpt-mermaid-\_r_ai\_ .node ellipse,#chatgpt-mermaid-\_r_ai\_ .node polygon,#chatgpt-mermaid-\_r_ai\_ .node path{fill:rgb(222, 234, 251);stroke:rgb(83, 154, 248);stroke-width:1px;}#chatgpt-mermaid-\_r_ai\_ .rough-node .label text,#chatgpt-mermaid-\_r_ai\_ .node .label text,#chatgpt-mermaid-\_r_ai\_ .image-shape .label,#chatgpt-mermaid-\_r_ai\_ .icon-shape .label{text-anchor:middle;}#chatgpt-mermaid-\_r_ai\_ .node .katex path{fill:#000;stroke:#000;stroke-width:1px;}#chatgpt-mermaid-\_r_ai\_ .rough-node .label,#chatgpt-mermaid-\_r_ai\_ .node .label,#chatgpt-mermaid-\_r_ai\_ .image-shape .label,#chatgpt-mermaid-\_r_ai\_ .icon-shape .label{text-align:center;}#chatgpt-mermaid-\_r_ai\_ .node.clickable{cursor:pointer;}#chatgpt-mermaid-\_r_ai\_ .root .anchor path{fill:rgb(143, 143, 143)!important;stroke-width:0;stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_ai\_ .arrowheadPath{fill:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_ai\_ .edgePath .path{stroke:rgb(143, 143, 143);stroke-width:1px;}#chatgpt-mermaid-\_r_ai\_ .flowchart-link{stroke:rgb(143, 143, 143);fill:none;}#chatgpt-mermaid-\_r_ai\_ .edgeLabel{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_ai\_ .edgeLabel p{background-color:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_ai\_ .edgeLabel rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_ai\_ .labelBkg{background-color:rgba(252, 252, 252, 0.5);}#chatgpt-mermaid-\_r_ai\_ .cluster rect{fill:rgb(243, 243, 243);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_ai\_ .cluster text{fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ai\_ .cluster span{color:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ai\_ div.mermaidTooltip{position:absolute;text-align:center;max-width:200px;padding:2px;font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";font-size:12px;background:rgb(243, 243, 243);border:1px solid rgba(0, 0, 0, 0.1);border-radius:2px;pointer-events:none;z-index:100;}#chatgpt-mermaid-\_r_ai\_ .flowchartTitleText{text-anchor:middle;font-size:18px;fill:rgb(13, 13, 13);}#chatgpt-mermaid-\_r_ai\_ rect.text{fill:none;stroke-width:0;}#chatgpt-mermaid-\_r_ai\_ .icon-shape,#chatgpt-mermaid-\_r_ai\_ .image-shape{background-color:rgb(252, 252, 252);text-align:center;}#chatgpt-mermaid-\_r_ai\_ .icon-shape p,#chatgpt-mermaid-\_r_ai\_ .image-shape p{background-color:rgb(252, 252, 252);padding:2px;}#chatgpt-mermaid-\_r_ai\_ .icon-shape .label rect,#chatgpt-mermaid-\_r_ai\_ .image-shape .label rect{opacity:0.5;background-color:rgb(252, 252, 252);fill:rgb(252, 252, 252);}#chatgpt-mermaid-\_r_ai\_ .label-icon{display:inline-block;height:1em;overflow:visible;vertical-align:-0.125em;}#chatgpt-mermaid-\_r_ai\_ .node .label-icon path{fill:currentColor;stroke:revert;stroke-width:revert;}#chatgpt-mermaid-\_r_ai\_ .node .neo-node{stroke:rgb(83, 154, 248);}#chatgpt-mermaid-\_r_ai\_ [data-look="neo"].node rect,#chatgpt-mermaid-\_r_ai\_ [data-look="neo"].cluster rect,#chatgpt-mermaid-\_r_ai\_ [data-look="neo"].node polygon{stroke:url(#chatgpt-mermaid-\_r_ai\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ai\_ [data-look="neo"].swimlane.cluster rect{filter:none;}#chatgpt-mermaid-\_r_ai\_ [data-look="neo"].node path{stroke:url(#chatgpt-mermaid-\_r_ai\_-gradient);stroke-width:1px;}#chatgpt-mermaid-\_r_ai\_ [data-look="neo"].node .outer-path{filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ai\_ [data-look="neo"].node .neo-line path{stroke:rgb(83, 154, 248);filter:none;}#chatgpt-mermaid-\_r_ai\_ [data-look="neo"].node circle{stroke:url(#chatgpt-mermaid-\_r_ai\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ai\_ [data-look="neo"].node circle .state-start{fill:#000000;}#chatgpt-mermaid-\_r_ai\_ [data-look="neo"].icon-shape .icon{fill:url(#chatgpt-mermaid-\_r_ai\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ai\_ [data-look="neo"].icon-shape .icon-neo path{stroke:url(#chatgpt-mermaid-\_r_ai\_-gradient);filter:drop-shadow( 1px 2px 2px rgba(185,185,185,1));}#chatgpt-mermaid-\_r_ai\_ .node text{font-size:14px;font-weight:600;letter-spacing:normal;fill:rgb(0, 79, 153);}#chatgpt-mermaid-\_r_ai\_ .edgeLabels text{font-size:13px;font-weight:600;letter-spacing:-0.08px;fill:rgb(0, 79, 153);}#chatgpt-mermaid-\_r_ai\_ .node tspan[font-weight="normal"],#chatgpt-mermaid-\_r_ai\_ .edgeLabels tspan[font-weight="normal"]{font-weight:600;}#chatgpt-mermaid-\_r_ai\_ .edgeLabel .label rect{opacity:1;rx:13px;ry:13px;fill:rgb(245, 250, 255);stroke:rgb(206, 219, 229);stroke-width:1px;}#chatgpt-mermaid-\_r_ai\_ .node rect,#chatgpt-mermaid-\_r_ai\_ .node circle,#chatgpt-mermaid-\_r_ai\_ .node ellipse,#chatgpt-mermaid-\_r_ai\_ .node polygon,#chatgpt-mermaid-\_r_ai\_ .node path{fill:rgb(229, 243, 255);stroke:rgba(0, 0, 0, 0.1);stroke-width:1px;}#chatgpt-mermaid-\_r_ai\_ .node rect{rx:16px;ry:16px;}#chatgpt-mermaid-\_r_ai\_ .mermaid-decision .label-container{fill:rgb(245, 250, 255);stroke:rgb(206, 219, 229);stroke-dasharray:2,2;}#chatgpt-mermaid-\_r_ai\_ .edgePaths .flowchart-link{stroke:rgb(143, 143, 143);stroke-width:1px;stroke-linecap:round;stroke-linejoin:round;}#chatgpt-mermaid-\_r_ai\_ .marker{fill:rgb(143, 143, 143);stroke:rgb(143, 143, 143);}#chatgpt-mermaid-\_r_ai\_ :root{--mermaid-font-family:-apple-system-body,ui-sans-serif,-apple-system,system-ui,"Segoe UI",Helvetica,"Apple Color Emoji",Arial,sans-serif,"Segoe UI Emoji","Segoe UI Symbol";}Open Samkrushi AppCheck PIN CodeService Available?Show Unavailable MessageHome PageBrowse ProductsProduct DetailsAdd Fixed Pack to CartShopping CartAuthenticated?Login / OTP VerificationAddress SelectionSelect Delivery SlotReview OrderSelect Payment MethodCreate OrderPayment MethodRazorpay CheckoutCOD Order ConfirmationWebhook Payment VerificationOrder StatusDeliveryCustomer Support / OrderHistoryNoYesNoYesOnlineCOD

The customer app must not independently determine whether stock, prices, serviceability or delivery capacity is valid. The backend is authoritative.

## 3. Application navigation structure

Use Expo Router for navigation.

Suggested route structure:

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
│   │       ├── privacy.tsx
│   │       ├── terms.tsx
│   │       ├── delivery.tsx
│   │       └── refunds.tsx
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
│       │       └── [orderId].tsx
│       │
│       ├── orders/
│       │   ├── index.tsx
│       │   └── [orderId].tsx
│       │
│       ├── account/
│       │   ├── index.tsx
│       │   ├── profile.tsx
│       │   ├── preferences.tsx
│       │   ├── delete-account.tsx
│       │   │
│       │   └── addresses/
│       │       ├── index.tsx
│       │       ├── new.tsx
│       │       └── [addressId].tsx
│       │
│       └── support/
│           ├── index.tsx
│           ├── new.tsx
│           └── [ticketId].tsx
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

The agent may adapt the exact route structure to the existing repository, but the screen responsibilities and business flows must remain consistent.

## 4. Screen-by-screen functional specification

### 4.1 Splash screen and application initialization

Purpose: Initialize the application and restore the customer's session.

Requirements:

- Display the approved Samkrushi logo.
- Show a short loading state.
- Restore the customer's authentication session securely (chunked/encrypted secure storage; master §13.5).
- Load public application configuration (`get-app-config`: customer-safe settings, support contacts, policy links, feature flags such as COD enabled and payment checkout mode, minimum supported app version).
- Check for a persisted pending checkout and reconcile it (§4.14, master §13.3).
- Retrieve the saved PIN/address context.
- Load any required serviceability information.
- Handle network failures gracefully.
- Allow guest users to continue without signing in.

Do not block the customer from browsing merely because they are not authenticated.

### 4.2 Serviceability screen

Purpose: Determine whether Samkrushi can deliver to the customer's location.

Fields:

- PIN code.
- Optional saved address selection.

Flow:

1. Customer enters PIN code.
2. App sends PIN code to the serviceability API.
3. Backend checks the PIN against active delivery zones.
4. Backend returns availability and relevant delivery options.
5. App displays the result.

Possible responses:

| Response              | App behavior                     |
| --------------------- | -------------------------------- |
| Serviceable           | Continue to home page            |
| Not serviceable       | Display unavailable message      |
| Temporarily suspended | Explain temporary unavailability |
| Invalid PIN           | Ask customer to correct it       |
| Network failure       | Show retry option                |

Do not assume serviceability based only on a city or locality name.

API: `get-serviceability`

### 4.3 Home page

Purpose: Main product discovery page.

Suggested sections:

1. Header with Samkrushi logo.
2. Selected delivery PIN/address.
3. Search bar.
4. Product categories.
5. Featured or seasonal products, when configured.
6. Available products.
7. Delivery information.
8. Cart shortcut.
9. Account shortcut.

Each product card should display:

- Product image.
- Product name.
- Pack size.
- Unit.
- Customer price.
- Add-to-cart action.
- Availability status where appropriate (`available`, `limited` or `unavailable`, mapped to display labels in the app).

The product catalog must come from the backend (`get-catalog` Edge Function). It returns availability status and a server-computed `maxOrderable` pack count per SKU, derived from the shared availability function. The app never receives, displays or derives raw farmer-supply totals. Quantities arrive as decimal strings and prices as integer paise (ADR-0003).

The customer must not see:

- Farmer purchase prices.
- Supplier bank details.
- Internal procurement notes.
- Supplier contact information.
- Private inventory or operational records.

### 4.4 Product category screen

Display products grouped by predefined categories.

Examples of categories may include:

- Vegetables.
- Leafy vegetables.
- Fruits.
- Other categories configured by Samkrushi.

Requirements:

- Category name and description.
- Product cards.
- Product images.
- Pack sizes.
- Price.
- Availability.
- Pagination or incremental loading.
- Refresh behavior.
- Empty state when no products are available.

The categories must be maintained through the admin catalog rather than hard-coded independently in the app. Category metadata is read RLS-direct (active rows). Products per category come from `get-catalog` with a category filter.

### 4.5 Product search screen

Customers must be able to search by product or category name.

Requirements:

- Search input.
- Debounced API search (`get-catalog` with a `q` parameter; server-side matching).
- Clear search action.
- Search results.
- No-result message.
- Loading and error states.
- Ignore stale responses when a newer query has already been submitted.

Offline cached results may be displayed as stale information, but must not be treated as valid inventory or checkout authorization.

### 4.6 Product detail screen

When a customer opens a product, display:

- Product name.
- Product images.
- Product description.
- Available fixed-pack SKUs.
- Pack size and unit.
- Price.
- Delivery-date availability per SKU (status + `maxOrderable`, from `get-product-detail`).
- Verified handling or storage details, when provided.

The customer selects a fixed pack and quantity.

Example:

| SKU          | Pack size | Price              |
| ------------ | --------- | ------------------ |
| Tomato 500 g | 500 g     | ₹ configured price |
| Tomato 1 kg  | 1 kg      | ₹ configured price |

The above is only an illustrative layout; actual catalog values must come from the admin-managed catalog.

Quantity controls must follow the SKU's configured minimum, maximum and increment (in packs), and must not exceed the server-provided `maxOrderable`. Each SKU is a fixed pack of the product's base unit (`products` + `product_skus`, ADR-0006). Availability is shared across a product's SKUs.

Never invent nutritional values or make unverified claims such as organic, chemical-free or pesticide-free.

### 4.7 Shopping cart

The cart must display:

- Product name.
- Pack size.
- Quantity.
- Unit price.
- Line total.
- Subtotal.
- Remove action.
- Quantity update action.

Requirements:

- Cart should persist locally across normal app restarts.
- Guest users can add items.
- Cart should remain available after customer login.
- Customers should be able to edit quantities.
- The app must clearly indicate that stock and prices are revalidated at checkout.
- Cart contents must not be treated as reserved inventory.
- After login, and before the quote, revalidate every line. Flag inactive SKUs, changed prices, unavailable items and quantities above `maxOrderable` with clear messages. Never drop or change lines silently (master §13.4).

Use local cart state for convenience, not as the source of truth for availability.

### 4.8 Authentication screen

Authentication is required before placing an order.

Use the configured Supabase Auth flow. The customer authentication method is an open founder decision (`docs/business-decisions.md`, master Phase 5). Phone OTP needs a paid SMS provider and India DLT registration, which require approval. Customer sign-up never grants staff access (shared Auth project, ADR-0005). If phone OTP authentication is chosen:

1. Customer enters phone number.
2. App validates input.
3. Backend/auth provider sends OTP.
4. Customer enters OTP.
5. OTP is verified.
6. Customer session is restored.
7. Customer returns to checkout with cart preserved.

Requirements:

- Validate phone format.
- Apply OTP resend cooldown.
- Apply verification attempt limits.
- Do not log OTPs or tokens.
- Show recoverable verification errors.

### 4.9 Customer profile

The profile screen should provide:

- Customer name.
- Phone number.
- Email, if collected.
- Saved addresses.
- Order history shortcut.
- Preferences.
- Support.
- Privacy policy.
- Terms.
- Account deletion request.

Collect only information needed to operate the service.

### 4.10 Address management

Address form fields:

- Recipient name.
- Contact phone.
- Address line 1.
- Address line 2, if applicable.
- Landmark.
- Locality/area.
- City.
- State.
- PIN code.
- Address label (Home, Work, Other).
- Default address selection.

Requirements:

- Add address.
- Edit address.
- Delete address where allowed (soft archive through `archive-address`; orders keep their address snapshot; the rule for addresses on active orders is a founder decision).
- Set default address.
- Verify serviceability with backend. `save-address` (Edge Function) creates, updates and sets the default, and runs the server serviceability check.
- Customer can modify only their own addresses. The address list is read RLS-direct.
- Do not request precise location. Latitude/longitude stay empty unless an approved feature needs them and the customer consents.

### 4.11 Checkout — address selection

Customer selects an existing address or creates a new one.

The app must call the serviceability API again.

Do not rely on an earlier PIN-code check if the selected address is different.

### 4.12 Checkout — delivery slot

Backend provides available delivery dates and slots.

Each slot may contain:

- Delivery date.
- Start time.
- End time.
- Capacity state.
- Cutoff information.

The initial operating target may be early-morning delivery, but the actual time and capacity must be controlled through configuration.

Important:

- The customer app must not hard-code midnight cutoffs.
- Server time in `Asia/Kolkata` determines eligibility.
- Slot selection is provisional until order creation reserves capacity.
- Refresh availability if a slot has expired or become unavailable.

### 4.13 Checkout — order review

Display:

- Selected delivery address.
- Delivery date and slot.
- Product items.
- Pack size.
- Quantity.
- Subtotal.
- Valid discounts, if any.
- Delivery charge.
- Taxes, if configured.
- Final payable amount.
- Payment methods.
- Substitution preference.
- Relevant delivery/cancellation/refund policy links.

All totals must be calculated or validated by the backend. The review screen renders the response of `get-checkout-quote` (Edge Function). It returns server-calculated lines, subtotal, discounts, delivery fee, taxes, total, COD eligibility, availability/slot issues and a quote reference. The quote reserves nothing.

If prices, stock or slot capacity change, whether reported in the quote or by `create-order` as a quote-changed error with a new quote, show an explanation and ask the customer to review the updated order.

### 4.14 Payment screen

Supported payment choices:

Online payment (release 1: Razorpay Hosted/Standard Checkout, ADR-0008)

- Persist the idempotency key and quote reference locally, then create the internal order through `create-order`.
- Backend reserves stock/slot, creates the Razorpay order, and returns a short-lived hosted-checkout session.
- App opens the hosted payment page in the system or in-app browser through `expo-web-browser`. The page runs Razorpay Standard Checkout for the server-created order.
- The page redirects to the app's return link (verified Android App Link, with a custom-scheme fallback). The return, a cancellation or a browser dismissal only triggers a status query.
- App queries backend (`get-order-status`) for actual order/payment state.
- Verified webhook (or server-side provider reconciliation) confirms payment.
- While the reservation is active, a pending order can reopen payment through `resume-payment`. This never creates a new order.
- The native `react-native-razorpay` SDK is a possible later enhancement behind a server-controlled checkout-mode flag. Hosted Checkout remains the permanent fallback.

Cash on Delivery

- Show only when permitted by backend configuration.
- Server validates zone, slot, order value and COD policy.
- Record amount due for delivery.

The client-side success callback is not proof of payment.

If the app closes during payment, it must recover the pending order and query the backend rather than automatically creating another order. The persisted pending-checkout record (`idempotencyKey`, `quoteReference`, `orderId`, `sessionExpiresAt`; no payment data) is reconciled on launch and resume (master §13.3), and cleared on a terminal state.

### 4.15 Order confirmation

Display:

- Order number.
- Items.
- Address summary.
- Delivery date/slot.
- Total.
- Payment state.
- Order status.
- Link to order details.

Do not show an order as paid until the backend confirms payment.

### 4.16 Order history

Provide:

- Active orders.
- Completed orders.
- Cancelled orders.

Each card should show order number, date, total and current state. The list is read RLS-direct from the customer's own order-summary view.

### 4.17 Order details and tracking

Display a server-derived status timeline.

Potential milestones:

```
Order placed
    ↓
Payment confirmed / COD confirmed
    ↓
Order processing
    ↓
Picking and packing
    ↓
Packed
    ↓
Out for delivery
    ↓
Delivered
```

Actual order states must follow the backend state machine. `get-order-status` derives the timeline on the server from order, payment and fulfilment history. The UI must also render terminal and exception states: `cancelled`, `delivery_failed`, `returned`, and refund states.

Live GPS tracking is not required for the first release.

### 4.18 Cancellation and refunds

The app must:

- Show whether cancellation is allowed (`cancellationEligibility` from `get-order-status`; computed on the server).
- Allow a cancellation request when permitted.
- Collect cancellation reason.
- Show whether staff approval is required.
- Display refund status independently from order status.

Possible refund states include requested, processing, confirmed/refunded, failed or manual review. These map to the backend `refund_status` values `requested`, `pending` (processing), `processed` (refunded), `failed`, `cancelled` and `manual_review`. The display mapping lives in `packages/shared`.

Never claim a refund is complete before provider confirmation/reconciliation.

### 4.19 Substitution preferences

The customer may select preferences supported by Samkrushi's approved policy, such as:

- No substitutions.
- Allow only an approved replacement.
- Contact me before substitution, if this option is enabled operationally.

The option set is an **open founder decision**. "Allow similar" and "allow only an approved replacement" carry different consent semantics, and the source specs disagree. The app renders only the options the backend enables. The dev default enables only `no_substitution`.

Never silently substitute a product.

Any replacement that changes a paid order amount requires an explicitly approved business and payment flow.

### 4.20 Customer support

Support screen should allow:

- Browse help topics.
- View configured support contacts.
- Create complaint/ticket.
- Link complaint to an order.
- Enter issue description.
- Attach an optional permitted image.
- View ticket status and public responses.

Transports: `create-support-ticket` and `add-support-message` (Edge Functions; order-ownership checks and rate limits); attachments through `create-upload-url` to private storage; ticket list/detail and public replies read RLS-direct from a customer view. Help topics and attachment limits are founder decisions.

Internal staff-only notes must not be displayed.

### 4.21 Account deletion

Provide an authenticated account-deletion request.

Requirements:

- Recent authentication/step-up where appropriate.
- Submit request to backend.
- Display request state.
- Explain approved retention/anonymization rules.
- Do not claim deletion is complete until backend workflow has completed.
- Uses `request-account-deletion`. The public web page `/delete-account` is the store-required fallback (master §13.8).

### 4.22 Delivery OTP display (master Phase 7)

Purpose: give the customer the one-time code that the rider enters as proof of delivery.

- On an owned order in an eligible delivery state (for example out for delivery), order details shows "Show delivery code".
- The app calls `get-delivery-otp` (Edge Function). The server issues a single-use code, stores only its hash, and returns the plaintext only to the authenticated owner.
- Display the code large and accessible (TalkBack-readable, not colour-only), with a short instruction to share it only with the assigned rider at handover.
- Re-requesting is rate-limited and invalidates the previous code. Explain this before reissuing.
- Never put the code in push notifications, lock-screen text, logs or analytics. Do not cache it beyond the screen session.
- After delivery is confirmed, refresh order state from `get-order-status`.
- Additional channels (such as SMS) and the code length/expiry are founder decisions held as server settings.

## 5. State management and data ownership

### 5.1 Backend-owned data

The following must always come from backend-authoritative services:

- Product catalog.
- SKU and pack sizes.
- Prices.
- Tax configuration.
- Delivery charges.
- Serviceability.
- Delivery slot availability.
- Sellable stock.
- Reservations.
- Orders.
- Payment status.
- Refund status.
- Cancellation eligibility.
- Account deletion state.

### 5.2 Client-owned state

The app may manage:

- UI state.
- Navigation state.
- Search input.
- Cached read-only public catalog.
- Local cart draft.
- Display preferences.

### 5.3 Recommended libraries

| Responsibility         | Recommendation                   |
| ---------------------- | -------------------------------- |
| Navigation             | Expo Router                      |
| Server state           | TanStack Query                   |
| Cart/transient state   | Zustand                          |
| Validation             | Zod                              |
| Forms                  | React Hook Form                  |
| Authentication         | Supabase Auth                    |
| Secure session storage | `expo-secure-store` (Keystore-backed) with a chunked or encrypted large-session adapter (master §13.5) |
| Push notifications     | Expo Notifications               |
| Payment                | Razorpay Hosted/Standard Checkout through `expo-web-browser` (ADR-0008); native SDK later |

Do not duplicate backend business rules in React Native components.

### 5.4 Offline behavior

- Cached catalog is stale and read-only.
- Customers can edit cart locally.
- Checkout requires a network connection.
- Do not queue payment or order creation blindly.
- Pending checkout recovery must reuse its idempotency key and reconcile against server state.

## 6. Android-specific requirements

### 6.1 System navigation

- Support Android system Back.
- Close a modal/sheet before navigating away from its parent page.
- Do not unexpectedly discard checkout information.
- Preserve cart and form state during normal navigation.
- Do not exit the app unexpectedly from nested checkout screens.

### 6.2 Android UI behavior

- Correct status-bar and navigation-bar appearance.
- Support supported screen sizes.
- Keyboard must not cover OTP, payment or address controls.
- Respect font scaling.
- Handle dark/light system configuration where implemented.
- Use responsive layouts for small devices.

### 6.3 Push notifications

Use Expo Notifications initially.

Potential notification types:

- Order confirmed.
- Payment confirmed.
- Order packed.
- Out for delivery.
- Delivered.
- Cancellation/refund status.
- Support response.

Requirements:

- Ask notification permission contextually.
- Use appropriate Android notification channels.
- Handle push-token refresh (`register-push-token`).
- Remove invalid/revoked tokens (`revoke-push-token` on logout or permission loss; server deactivates invalid tokens).
- Keep payloads minimal. Never include delivery OTPs or sensitive details.
- Tapping notification opens the correct order after authentication is restored.

Push notifications are informational, not authoritative business records.

### 6.4 Deep links and payment recovery

- Configure verified Android App Links for the approved domain (`assetlinks.json` hosted there; the domain is a founder decision). Keep a custom-scheme fallback for the hosted-checkout return.
- Test hosted-checkout return (success, cancel, browser dismissal, back press) when the app is foregrounded, backgrounded and terminated.
- Recover the pending order after process death.
- Query backend payment/order state.
- Handle duplicate callbacks safely.
- Handle delayed webhook events.
- Never assume cancellation callback means payment failed.

### 6.5 Device compatibility testing

Test:

- Supported Android OS versions.
- Small and large screens.
- Low-memory devices.
- Slow/intermittent networks.
- Keyboard interactions.
- Font scaling.
- Background restrictions of common device manufacturers.
- Notification permission denial.
- App process termination during payment.

### 6.6 Google Play release

Google Play is the release 1 store (ADR-0009). Release configuration (per-environment `applicationId` variants in `app.config.ts`, EAS build/submit profiles, FCM credentials through Expo, notification channels) is maintained from master Phase 1. Store identity, account ownership and signing custody are founder decisions.

Prepare:

- Package/application ID.
- App name and approved logo.
- Icons and splash assets.
- Versioning.
- Secure Android signing.
- Internal testing build.
- Staged rollout.
- Store screenshots and listing.
- Privacy policy and accurate data-safety declarations.

Check current Google Play target-SDK, permission and policy requirements during release preparation.

## 7. Security and privacy requirements

- Never put Supabase service-role credentials in the app.
- Never put Razorpay secret or webhook secret in the app.
- Use secure storage for sensitive session information.
- Never log OTPs, passwords or tokens.
- Customer can access only their own addresses, profile, orders and tickets.
- Validate all API inputs on the server.
- Never trust client price or stock calculations.
- Use HTTPS in production.
- Do not expose supplier or internal business information.
- Account deletion and privacy workflows must follow approved policy.

## 8. Accessibility

- TalkBack support.
- Accessible labels and hints.
- Logical screen-reader navigation.
- Adequate touch targets.
- High contrast.
- Non-color-only status communication.
- Accessible error messages.
- Support font scaling.
- Respect reduced motion where applicable.

## 9. Android acceptance criteria

1. Guest users can browse without signing in.
2. Serviceability is verified by the backend.
3. Only eligible products appear for the selected delivery date/zone.
4. Product pack sizes and units are clear.
5. Cart survives app restart and authentication.
6. Checkout revalidates price, stock, address and slot.
7. Concurrent checkout cannot oversell inventory or overbook slots.
8. Duplicate requests cannot create duplicate orders.
9. Client callback cannot mark payment as paid.
10. Duplicate/delayed webhook does not double-confirm an order.
11. App process death during payment restores correct order state.
12. COD is shown only when permitted.
13. Customer reads only their own records.
14. Cancellation and refund states come from backend.
15. Notification deep link opens the correct authorized order.
16. Account deletion is authenticated and traceable.
17. Offline catalog is identified as stale.
18. TalkBack, font scaling, keyboard and Back navigation pass tests.
19. Review totals come from `get-checkout-quote`. A changed quote is shown for re-review before ordering.
20. Hosted-checkout return, cancellation and dismissal never mark an order paid or failed; only server state does.
21. The delivery OTP is shown only to the order owner, never in notifications, and matches what the rider enters.
22. Guest cart lines are revalidated after login, with stale items clearly flagged.
23. Catalog shows availability status and `maxOrderable` only, never raw supply quantities.

## 10. Android implementation sequence

These are sub-steps, not a separate phase numbering. Master phases govern (ADR-0001).

| Step | Work                                                    | Master phase |
| ---- | ------------------------------------------------------- | ------------ |
| 1    | Expo setup, routing, theme, shared packages, Android + iOS build configs | 1 |
| 2    | App config, auth/session (secure storage) and serviceability | 5 |
| 3    | Home, categories, search and product details            | 5            |
| 4    | Cart, persistence and post-login revalidation           | 5            |
| 5    | Profile and addresses                                   | 5            |
| 6    | Slot selection and checkout review (quote)              | 5 (slots), 6 (quote) |
| 7    | Razorpay Hosted Checkout, pending checkout recovery and COD | 6        |
| 8    | Order confirmation, history and tracking                | 6 (confirmation), 8 |
| 8a   | Delivery OTP display                                    | 7            |
| 9    | Cancellation, support and account deletion              | 8            |
| 10   | Notifications, deep links and Android release hardening (release 1) | 9 |

Each step must be tested before proceeding.

## 11. Definition of done

The Android app is ready for pilot testing, as release 1, when:

- All launch customer journeys work end to end.
- Backend remains the source of truth.
- Authentication and RLS restrictions are verified.
- Checkout/payment recovery passes.
- No stock overselling or slot overbooking is possible in tested concurrency cases.
- Push notifications work without becoming a dependency for order correctness.
- Android navigation/accessibility tests pass.
- Internal testing build is installed and tested on physical devices.
- Production configuration and store requirements are reviewed.