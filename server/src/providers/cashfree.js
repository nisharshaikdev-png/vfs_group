import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';

const apiVersion = '2025-01-01';
const useMock = () => env.NODE_ENV === 'test' || env.PAYMENT_PROVIDER === 'mock';
const endpoint = () => env.CASHFREE_ENVIRONMENT === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';

async function cashfreeRequest(path, options = {}) {
  if (!env.CASHFREE_APP_ID || !env.CASHFREE_SECRET_KEY) throw new ApiError(503, 'PAYMENT_NOT_CONFIGURED', 'Cashfree credentials have not been configured.');
  let response;
  try {
    response = await fetch(`${endpoint()}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': apiVersion,
        'x-client-id': env.CASHFREE_APP_ID,
        'x-client-secret': env.CASHFREE_SECRET_KEY,
        'x-request-id': randomUUID(),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(502, 'PAYMENT_PROVIDER_UNAVAILABLE', 'The payment service is temporarily unavailable. Please try again.');
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', body?.message || body?.type || 'Cashfree could not prepare the payment.');
  return body;
}

export async function createConnectorRegistrationOrder({ registrationId, fullName, mobile, email, amountPaise, expiresAt }) {
  if (useMock()) {
    const label = encodeURIComponent('TEST PAYMENT - use the simulation button');
    return { provider: 'mock', orderId: `order_mock_${randomUUID()}`, paymentSessionId: '', qrId: `qr_mock_${randomUUID()}`, imageUrl: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='320'%3E%3Crect width='100%25' height='100%25' fill='white'/%3E%3Crect x='18' y='18' width='284' height='284' fill='none' stroke='%23004658' stroke-width='12'/%3E%3Ctext x='160' y='145' text-anchor='middle' font-size='25' font-family='sans-serif' font-weight='700'%3ETEST PAYMENT%3C/text%3E%3Ctext x='160' y='185' text-anchor='middle' font-size='13' font-family='sans-serif'%3E${label}%3C/text%3E%3C/svg%3E` };
  }
  const orderId = `conn_${registrationId.replaceAll('-', '')}`;
  const orderMeta = {};
  if (env.CASHFREE_WEBHOOK_URL) orderMeta.notify_url = env.CASHFREE_WEBHOOK_URL;
  const order = await cashfreeRequest('/orders', {
    method: 'POST',
    headers: { 'x-idempotency-key': registrationId },
    body: JSON.stringify({
      order_id: orderId,
      order_amount: amountPaise / 100,
      order_currency: 'INR',
      order_expiry_time: expiresAt.toISOString(),
      order_note: 'VFS Groups connector registration fee',
      customer_details: {
        customer_id: registrationId,
        customer_name: fullName,
        customer_phone: mobile,
        ...(email ? { customer_email: email } : {}),
      },
      ...(Object.keys(orderMeta).length ? { order_meta: orderMeta } : {}),
      order_tags: { registration_id: registrationId, purpose: 'connector_registration' },
    }),
  });
  return { provider: 'cashfree', orderId: order.order_id, paymentSessionId: order.payment_session_id, qrId: undefined, imageUrl: undefined };
}

export const getCashfreeOrder = (orderId) => cashfreeRequest(`/orders/${encodeURIComponent(orderId)}`);
export const getCashfreeOrderPayments = (orderId) => cashfreeRequest(`/orders/${encodeURIComponent(orderId)}/payments`);
export const isMockPaymentProvider = useMock;
