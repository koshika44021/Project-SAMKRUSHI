One important architecture decision: Android and iOS will have separate build and release configurations, but both should use the same Expo React Native mobile codebase inside the monorepo. This avoids maintaining the same business logic twice.

# File 3: `SAMKRUSHI_ANDROID_APP_SPEC.md`

# SAMKRUSHI — Android Customer Application Specification

Application: Android customer application\
Monorepo location: `apps/mobile`\
Technology: Expo + React Native + TypeScript\
Version: 1.0\
Target market: Hyderabad, Telangana, India\
Depends on: `SAMKRUSHI_MASTER_MONOREPO_SPEC.md`

## 1. Purpose and application scope

The Samkrushi Android application is the primary customer-facing shopping platform.

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
14. Razorpay online payments.
15. Cash on Delivery, only when enabled by business rules.
16. Order confirmation.
17. Order history.
18. Order tracking.
19. Cancellation and refund requests.
20. Customer support.
21. Push notifications.
22. Account deletion request.

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
- Restore the customer's authentication session securely.
- Load public application configuration.
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
- Availability status where appropriate.

The product catalog must come from the backend.

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

The categories must be maintained through the admin catalog rather than hard-coded independently in the app.

### 4.5 Product search screen

Customers must be able to search by product or category name.

Requirements:

- Search input.
- Debounced API search.
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
- Delivery-date availability.
- Verified handling or storage details, when provided.

The customer selects a fixed pack and quantity.

Example:

| SKU          | Pack size | Price              |
| ------------ | --------- | ------------------ |
| Tomato 500 g | 500 g     | ₹ configured price |
| Tomato 1 kg  | 1 kg      | ₹ configured price |

The above is only an illustrative layout; actual catalog values must come from the admin-managed catalog.

Quantity controls must follow the SKU's configured minimum, maximum and increment.

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

Use local cart state for convenience, not as the source of truth for availability.

### 4.8 Authentication screen

Authentication is required before placing an order.

Use the configured Supabase Auth flow. If phone OTP authentication is chosen:

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
- Delete address where allowed.
- Set default address.
- Verify serviceability with backend.
- Customer can modify only their own addresses.

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

All totals must be calculated or validated by the backend.

If prices, stock or slot capacity change, show an explanation and ask the customer to review the updated order.

### 4.14 Payment screen

Supported payment choices:

Online payment

- Create internal order through backend.
- Backend creates Razorpay order.
- App launches Razorpay checkout.
- App receives provider return/callback.
- App queries backend for actual order/payment state.
- Verified webhook confirms payment.

Cash on Delivery

- Show only when permitted by backend configuration.
- Server validates zone, slot, order value and COD policy.
- Record amount due for delivery.

The client-side success callback is not proof of payment.

If the app closes during payment, it must recover the pending order and query the backend rather than automatically creating another order.

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

Each card should show order number, date, total and current state.

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

Actual order states must follow the backend state machine.

Live GPS tracking is not required for the first release.

### 4.18 Cancellation and refunds

The app must:

- Show whether cancellation is allowed.
- Allow a cancellation request when permitted.
- Collect cancellation reason.
- Show whether staff approval is required.
- Display refund status independently from order status.

Possible refund states include requested, processing, confirmed/refunded, failed or manual review.

Never claim a refund is complete before provider confirmation/reconciliation.

### 4.19 Substitution preferences

The customer may select preferences supported by Samkrushi's approved policy, such as:

- No substitutions.
- Allow only an approved replacement.
- Contact me before substitution, if this option is enabled operationally.

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

Internal staff-only notes must not be displayed.

### 4.21 Account deletion

Provide an authenticated account-deletion request.

Requirements:

- Recent authentication/step-up where appropriate.
- Submit request to backend.
- Display request state.
- Explain approved retention/anonymization rules.
- Do not claim deletion is complete until backend workflow has completed.

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
| Secure session storage | Approved secure platform storage |
| Push notifications     | Expo Notifications               |
| Payment                | Razorpay integration             |

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
- Handle push-token refresh.
- Remove invalid/revoked tokens.
- Tapping notification opens the correct order after authentication is restored.

Push notifications are informational, not authoritative business records.

### 6.4 Deep links and payment recovery

- Configure verified Android App Links for the approved domain.
- Test payment return when app is foregrounded, backgrounded and terminated.
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

## 10. Android implementation sequence

| Phase | Work                                                    |
| ----- | ------------------------------------------------------- |
| 1     | Expo setup, routing, theme, shared packages             |
| 2     | Auth/session and serviceability                         |
| 3     | Home, categories, search and product details            |
| 4     | Cart and persistence                                    |
| 5     | Profile and addresses                                   |
| 6     | Slot selection and checkout review                      |
| 7     | Razorpay and COD                                        |
| 8     | Order confirmation, history and tracking                |
| 9     | Cancellation, support and account deletion              |
| 10    | Notifications, deep links and Android release hardening |

Each phase must be tested before proceeding.

## 11. Definition of done

The Android app is ready for pilot testing when:

- All launch customer journeys work end to end.
- Backend remains the source of truth.
- Authentication and RLS restrictions are verified.
- Checkout/payment recovery passes.
- No stock overselling or slot overbooking is possible in tested concurrency cases.
- Push notifications work without becoming a dependency for order correctness.
- Android navigation/accessibility tests pass.
- Internal testing build is installed and tested on physical devices.
- Production configuration and store requirements are reviewed.