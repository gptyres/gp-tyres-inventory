# Parcel Perfect courier quotes

The Courier Logistics Assistant can request a live Parcel Perfect / Siyanqoba quote through the existing staff-protected server route at `/api/business-agent` using the `COURIER_QUOTE` action.

## Configure Vercel environment variables

Add the `PP_ECOM_*` and `PP_ORIGIN_*` variables from `.env.example` to Vercel. These must remain server-only variables: do not use a `VITE_` prefix.

`PP_ECOM_EMAIL` and `PP_ECOM_PASSWORD` are the ecommerce-service credentials issued for the Parcel Perfect account. The service uses a salted login to obtain a short-lived token for each quote request.

The `PP_ORIGIN_*` variables must match the collection address configured in Parcel Perfect, including the courier area and town. Keep the delivery area and town precise; Parcel Perfect uses them for rate calculation.

## Staff workflow

1. Open **Courier Logistics** in the inventory portal.
2. Confirm the dimensions and total measured parcel mass.
3. Enter the recipient and delivery-area details.
4. Select **Get live courier rate**.

The rate request is protected by the portal's staff-session cookie. The browser never receives the Parcel Perfect username or password.

## Shopify follow-on

The live quote works independently of Shopify. To prefill this courier form from a Shopify order, create a Shopify custom app with read-only `read_orders` access and supply the store domain plus an Admin API access token. The inventory portal can then add an order lookup route that maps Shopify shipping-address and line-item data into the existing courier quote form.
