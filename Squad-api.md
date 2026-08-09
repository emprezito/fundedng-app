# Squad Payment Gateway — Full API Reference
> Source: https://docs.squadco.com | Compiled June 2026

---

## Environments

| Environment | Base URL |
|---|---|
| Sandbox/Test | `https://sandbox-api-d.squadco.com` |
| Production/Live | `https://api-d.squadco.com` |

**Authorization:** All requests use Bearer token via header:
```
Authorization: Bearer sk_your_live_secret_key
```

---

## 1. Initiate Payment

**POST** `https://api-d.squadco.com/transaction/initiate`

Returns a `checkout_url` that redirects the customer to Squad's payment modal.

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | String | ✅ | Customer's email address |
| `amount` | String/Integer | ✅ | Amount in **kobo** (₦100 = 10000 kobo) |
| `currency` | String | ✅ | `NGN` or `USD` |
| `initiate_type` | String | ✅ | Must be `"inline"` |
| `transaction_ref` | String | ✅ | Unique reference per transaction |
| `customer_name` | String | ✅ | Customer's full name |
| `callback_url` | String | ✅ | URL to redirect customer after payment |
| `payment_channels` | Array | ✅ | e.g. `["card", "bank", "ussd", "transfer"]` |
| `metadata` | Object | Optional | Extra data returned in webhook & verify |
| `pass_charge` | Boolean | Optional | `true` = customer pays charges. Default: `false` |
| `is_recurring` | Boolean | Optional | `true` to tokenize card for future charges |
| `sub_merchant_id` | String | Optional | For aggregators only |

### Sample Request
```json
{
  "amount": 43000,
  "email": "customer@example.com",
  "currency": "NGN",
  "initiate_type": "inline",
  "transaction_ref": "FNG-20260608-001",
  "customer_name": "John Doe",
  "callback_url": "https://fundedng.fun/payment/callback",
  "payment_channels": ["card", "bank", "ussd", "transfer"],
  "metadata": {
    "challenge_id": "abc123",
    "plan": "standard"
  }
}
```

### Success Response (200)
```json
{
  "status": 200,
  "message": "success",
  "data": {
    "auth_url": null,
    "access_token": null,
    "merchant_info": {
      "merchant_response": null,
      "merchant_name": null,
      "merchant_logo": null,
      "merchant_id": "SBN1EBZEQ8"
    },
    "currency": "NGN",
    "is_recurring": false,
    "callback_url": "https://fundedng.fun/payment/callback",
    "transaction_ref": "FNG-20260608-001",
    "transaction_amount": 43000,
    "authorized_channels": ["card", "ussd", "bank"],
    "checkout_url": "https://pay.squadco.com/FNG-20260608-001"
  }
}
```

### Error Response (400)
```json
{
  "status": 400,
  "success": false,
  "message": "\"email\" is required",
  "data": {}
}
```

### Unauthorized (401)
```json
{
  "status": 401,
  "message": "Initiate transaction Unauthorized",
  "data": null
}
```

---

## 2. Verify Transaction

**GET** `https://api-d.squadco.com/transaction/verify/{transaction_ref}`

Verify the status of a transaction after payment.

### Parameters
- `transaction_ref` (path param) — the unique transaction reference

### Success Response (200)
```json
{
  "status": 200,
  "success": true,
  "message": "Success",
  "data": {
    "transaction_amount": 43000,
    "transaction_ref": "FNG-20260608-001",
    "email": "customer@example.com",
    "transaction_status": "Success",
    "transaction_currency_id": "NGN",
    "created_at": "2026-06-08T10:00:00",
    "transaction_type": "Card",
    "merchant_name": "FundedNG",
    "merchant_business_name": "FundedNG Ltd",
    "gateway_transaction_ref": "FNG-20260608-001_1_1_1",
    "recurring": null,
    "merchant_email": "hello@fundedng.fun",
    "plan_code": null
  }
}
```

> `transaction_status` can be: **Success**, **Failed**, **Abandoned**, or **Pending**

### Error (400) — Invalid Ref
```json
{
  "status": 400,
  "success": false,
  "message": "Invalid transaction reference",
  "data": {}
}
```

### Error (403) — Wrong Key Type
```json
{
  "success": false,
  "message": "API key is invalid. Key must start with sandbox_sk_",
  "data": {}
}
```

---

## 3. Webhooks

Squad sends a POST request to your configured webhook URL when a transaction is successful.

### Setup
1. Squad Dashboard → Profile → API & Webhooks
2. Enter your **Webhook URL** (receives POST on successful payment)
3. Enter your **Redirect URL** (optional — Squad appends `?transaction_ref=xxx` when redirecting)

### Webhook Header
```
x-squad-encrypted-body: <HMAC hash of body — use for validation>
```

### Sample Webhook Payload (Card)
```json
{
  "Event": "charge_successful",
  "TransactionRef": "FNG-20260608-001",
  "Body": {
    "amount": 43000,
    "transaction_ref": "FNG-20260608-001",
    "gateway_ref": "FNG-20260608-001_1_1_1",
    "transaction_status": "Success",
    "email": "customer@example.com",
    "merchant_id": "SBBWRX1Z3S",
    "currency": "NGN",
    "transaction_type": "Card",
    "merchant_amount": 42570,
    "created_at": "2026-06-08T10:00:00",
    "meta": {
      "challenge_id": "abc123"
    },
    "payment_information": {
      "payment_type": "card",
      "pan": "424242******4242|0825",
      "card_type": "visa"
    },
    "is_recurring": false
  }
}
```

### Sample Webhook Payload (Transfer)
```json
{
  "Event": "charge_successful",
  "TransactionRef": "FNG-20260608-002",
  "Body": {
    "amount": 43000,
    "transaction_ref": "FNG-20260608-002",
    "transaction_status": "Success",
    "email": "customer@example.com",
    "currency": "NGN",
    "transaction_type": "Transfer",
    "merchant_amount": 42570,
    "created_at": "2026-06-08T10:00:00",
    "is_recurring": false
  }
}
```

> ⚠️ **Always check `transaction_ref` before giving value to avoid duplicate processing.**

---

## 4. Recurring Payments / Card Tokenization

To tokenize a card on first charge, add to initiate payload:
```json
{ "is_recurring": true }
```

The webhook response will include a `token_id` in `payment_information`. Store this for future charges.

### Charge a Tokenized Card

**POST** `https://api-d.squadco.com/transaction/charge_card`

```json
{
  "amount": 43000,
  "token_id": "AUTH_lBlGESHDLMX_60049043",
  "transaction_ref": "FNG-20260608-003"
}
```

---

## 5. Go Live Checklist

1. Change all base URLs from `sandbox-api-d.squadco.com` → `api-d.squadco.com`
2. Replace sandbox secret key (`sandbox_sk_...`) with live secret key (`sk_...`)
3. Complete KYC on [dashboard.squadco.com](https://dashboard.squadco.com)
4. Set Webhook URL and optionally Redirect URL in Dashboard → Profile → API & Webhooks
5. Ensure `transaction_ref` is unique per transaction — Squad rejects duplicate refs

---

## 6. Key Rules & Gotchas

| Rule | Detail |
|---|---|
| Amount in kobo | ₦100 = `10000`. Never send naira directly. |
| `initiate_type` | Must always be `"inline"` |
| Unique refs | Same ref used twice = 400 error |
| Secret key server-side only | Never expose `sk_...` on frontend |
| Public key (`pk_...`) | Frontend only, for Squad JS modal if used |
| Live base URL | `api-d.squadco.com` (not `api.squadco.com`) |
| Webhook IP | Squad sends from `18.133.63.109` — whitelist if needed |
| Redirect vs Webhook URL | Redirect = customer-facing. Webhook = server notification. These are different. |
| `checkout_url` field | The redirect URL is under `data.checkout_url` in the initiate response |

---

## 7. Useful URLs

| Resource | URL |
|---|---|
| Live Dashboard | https://dashboard.squadco.com |
| Sandbox Dashboard | https://sandbox.squadco.com |
| Full Docs | https://docs.squadco.com |
| Integration Support (Teams) | https://teams.live.com/l/invite/FDA6l6KrXUIrao3KwE |
| Support Email | help@squadco.com |