import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';
import { env } from '../../config/env.js';
import { ConnectorRegistrationPayment } from '../../models/ConnectorRegistrationPayment.js';
import { Contractor } from '../../models/Contractor.js';
import { PaymentWebhookEvent } from '../../models/PaymentWebhookEvent.js';
import { User } from '../../models/User.js';
import { createConnectorRegistrationOrder, getCashfreeOrder, getCashfreeOrderPayments, isMockPaymentProvider } from '../../providers/cashfree.js';
import { ApiError } from '../../utils/apiError.js';
import { registerPaidContractor } from '../auth/auth.service.js';

const publicPayment = (payment) => ({
  registrationId: payment.registrationId,
  fullName: payment.fullName,
  amountPaise: payment.amountPaise,
  currency: payment.currency,
  qrImageUrl: payment.qrImageUrl,
  paymentSessionId: payment.paymentSessionId,
  cashfreeMode: env.CASHFREE_ENVIRONMENT,
  status: payment.status,
  expiresAt: payment.expiresAt,
  paidAt: payment.paidAt,
  accountCreatedAt: payment.accountCreatedAt,
  mock: payment.provider === 'mock',
});

export async function startConnectorRegistration(input) {
  const duplicate = await User.exists({ $or: [{ mobile: input.mobile }, ...(input.email ? [{ email: input.email.toLowerCase() }] : [])], status: { $ne: 'deleted' } });
  if (duplicate) throw new ApiError(409, 'ACCOUNT_EXISTS', 'An account already exists for this mobile number or email.');
  await ConnectorRegistrationPayment.updateMany(
    { mobile: input.mobile, status: 'payment_pending' },
    { $set: { status: 'expired', failureReason: 'A newer registration payment was started.' }, $unset: { passwordHash: '' } },
  );
  const registrationId = randomUUID();
  const amountPaise = Math.round(env.CONNECTOR_REGISTRATION_FEE_INR * 100);
  const expiresAt = new Date(Date.now() + env.CONNECTOR_PAYMENT_EXPIRY_MINUTES * 60_000);
  const payment = await ConnectorRegistrationPayment.create({
    registrationId, fullName: input.fullName, mobile: input.mobile, email: input.email || undefined,
    businessName: input.businessName || undefined, country: input.country, city: input.city, state: input.state,
    consent: input.consent, passwordHash: await bcrypt.hash(input.password, 12), amountPaise, expiresAt,
    provider: isMockPaymentProvider() ? 'mock' : 'cashfree',
  });
  try {
    const order = await createConnectorRegistrationOrder({ registrationId, fullName: input.fullName, mobile: input.mobile, email: input.email, amountPaise, expiresAt });
    payment.provider = order.provider; payment.providerOrderId = order.orderId; payment.paymentSessionId = order.paymentSessionId;
    payment.providerQrId = order.qrId; payment.qrImageUrl = order.imageUrl;
    await payment.save();
  } catch (error) {
    await ConnectorRegistrationPayment.updateOne({ _id: payment._id }, { $set: { status: 'failed', failureReason: error.message }, $unset: { passwordHash: '' } });
    throw error;
  }
  return publicPayment(payment);
}

export async function getRegistrationStatus(registrationId) {
  const payment = await ConnectorRegistrationPayment.findOne({ registrationId }).select('+paymentSessionId');
  if (!payment) throw new ApiError(404, 'PAYMENT_REGISTRATION_NOT_FOUND', 'This payment registration was not found.');
  if (payment.status === 'payment_pending' && payment.expiresAt <= new Date()) {
    payment.status = 'expired'; payment.failureReason = 'The payment QR expired.';
    await ConnectorRegistrationPayment.updateOne({ _id: payment._id }, { $set: { status: payment.status, failureReason: payment.failureReason }, $unset: { passwordHash: '' } });
  }
  return publicPayment(payment);
}

async function createAccountForPaidPayment(paymentId, request) {
  let payment = await ConnectorRegistrationPayment.findOneAndUpdate(
    { _id: paymentId, status: 'paid' },
    { $set: { status: 'creating_account' }, $unset: { failureReason: '' } },
    { new: true },
  ).select('+passwordHash');
  if (!payment) {
    payment = await ConnectorRegistrationPayment.findById(paymentId);
    if (!payment) throw new ApiError(404, 'PAYMENT_REGISTRATION_NOT_FOUND', 'This payment registration was not found.');
    if (payment.status === 'account_created' || payment.status === 'creating_account') return payment;
    throw new ApiError(409, 'PAYMENT_NOT_COMPLETED', 'The connector registration payment has not been completed.');
  }
  try {
    const user = await registerPaidContractor({
      fullName: payment.fullName, mobile: payment.mobile, email: payment.email || '', businessName: payment.businessName || '',
      country: payment.country, city: payment.city, state: payment.state, consent: payment.consent,
    }, payment.passwordHash, request);
    payment = await ConnectorRegistrationPayment.findOneAndUpdate(
      { _id: payment._id, status: 'creating_account' },
      { $set: { status: 'account_created', connectorUser: user._id, accountCreatedAt: new Date() }, $unset: { passwordHash: '', failureReason: '' } },
      { new: true },
    );
    return payment;
  } catch (error) {
    const existingUser = await User.findOne({ mobile: payment.mobile });
    const existingConnector = existingUser && await Contractor.exists({ user: existingUser._id });
    if (existingUser && existingConnector) {
      return ConnectorRegistrationPayment.findByIdAndUpdate(payment._id, { $set: { status: 'account_created', connectorUser: existingUser._id, accountCreatedAt: new Date() }, $unset: { passwordHash: '', failureReason: '' } }, { new: true });
    }
    await ConnectorRegistrationPayment.updateOne(
      { _id: payment._id, status: 'creating_account' },
      { $set: { status: 'paid', failureReason: `Payment received, but account creation needs attention: ${error.message}` } },
    );
    throw error;
  }
}

export async function completeMockPayment(registrationId, request) {
  if (env.NODE_ENV === 'production' || !isMockPaymentProvider()) throw new ApiError(404, 'NOT_FOUND', 'Route not found.');
  const payment = await ConnectorRegistrationPayment.findOne({ registrationId });
  if (!payment) throw new ApiError(404, 'PAYMENT_REGISTRATION_NOT_FOUND', 'This payment registration was not found.');
  if (payment.status === 'payment_pending' && payment.expiresAt <= new Date()) throw new ApiError(410, 'PAYMENT_EXPIRED', 'This payment QR has expired. Start again.');
  if (payment.status === 'payment_pending') await ConnectorRegistrationPayment.updateOne(
    { _id: payment._id, status: 'payment_pending' },
    { $set: { status: 'paid', paidAt: new Date(), providerPaymentId: `pay_mock_${randomUUID()}` } },
  );
  return publicPayment(await createAccountForPaidPayment(payment._id, request));
}

async function markCashfreePaymentPaid(registration, providerPayment, request) {
  const amountPaise = Math.round(Number(providerPayment.payment_amount) * 100);
  if (providerPayment.payment_status !== 'SUCCESS' || amountPaise !== registration.amountPaise || providerPayment.payment_currency !== 'INR' || registration.provider !== 'cashfree') {
    throw new ApiError(409, 'PAYMENT_VERIFICATION_FAILED', 'The payment did not match this connector registration.');
  }
  await ConnectorRegistrationPayment.updateOne(
    { _id: registration._id, status: { $in: ['payment_pending', 'paid'] } },
    { $set: {
      status: 'paid',
      paidAt: registration.paidAt || (providerPayment.payment_time ? new Date(providerPayment.payment_time) : new Date()),
      providerPaymentId: String(providerPayment.cf_payment_id),
    } },
  );
  return createAccountForPaidPayment(registration._id, request);
}

export async function confirmCashfreePayment(registrationId, request) {
  const registration = await ConnectorRegistrationPayment.findOne({ registrationId }).select('+paymentSessionId');
  if (!registration) throw new ApiError(404, 'PAYMENT_REGISTRATION_NOT_FOUND', 'This payment registration was not found.');
  if (registration.provider !== 'cashfree') throw new ApiError(409, 'PAYMENT_PROVIDER_MISMATCH', 'This registration does not use Cashfree.');
  if (registration.status === 'account_created') return publicPayment(registration);
  const order = await getCashfreeOrder(registration.providerOrderId);
  if (order.order_status === 'EXPIRED') {
    registration.status = 'expired'; registration.failureReason = 'The Cashfree payment order expired.';
    await ConnectorRegistrationPayment.updateOne({ _id: registration._id }, { $set: { status: registration.status, failureReason: registration.failureReason }, $unset: { passwordHash: '' } });
    return publicPayment(registration);
  }
  if (order.order_status !== 'PAID') return publicPayment(registration);
  const attempts = await getCashfreeOrderPayments(registration.providerOrderId);
  const successful = attempts.find((attempt) => attempt.payment_status === 'SUCCESS');
  if (!successful) throw new ApiError(409, 'PAYMENT_VERIFICATION_PENDING', 'Cashfree has not confirmed the successful payment yet. Please wait a moment and try again.');
  return publicPayment(await markCashfreePaymentPaid(registration, successful, request));
}

export function verifyCashfreeWebhookSignature(rawBody, timestamp, signature) {
  if (!env.CASHFREE_SECRET_KEY) throw new ApiError(503, 'WEBHOOK_NOT_CONFIGURED', 'The Cashfree secret key is not configured.');
  if (!rawBody || !timestamp || !signature) return false;
  const expected = createHmac('sha256', env.CASHFREE_SECRET_KEY).update(`${timestamp}${rawBody.toString('utf8')}`).digest('base64');
  const supplied = Buffer.from(signature); const calculated = Buffer.from(expected);
  return supplied.length === calculated.length && timingSafeEqual(supplied, calculated);
}

export async function processCashfreeWebhook(request) {
  const timestamp = request.get('x-webhook-timestamp');
  const signature = request.get('x-webhook-signature');
  if (!verifyCashfreeWebhookSignature(request.rawBody, timestamp, signature)) throw new ApiError(400, 'WEBHOOK_SIGNATURE_INVALID', 'The Cashfree webhook signature is invalid.');
  const eventType = request.body?.type || 'unknown';
  const eventId = request.get('x-idempotency-key') || createHash('sha256').update(request.rawBody).digest('hex');
  let event;
  try { event = await PaymentWebhookEvent.create({ eventId, eventType }); }
  catch (error) { if (error?.code === 11000) return { duplicate: true }; throw error; }

  const order = request.body?.data?.order;
  const providerPayment = request.body?.data?.payment;
  if (eventType !== 'PAYMENT_SUCCESS_WEBHOOK' || !order || !providerPayment) {
    event.status = 'ignored'; await event.save(); return { ignored: true };
  }
  const registration = await ConnectorRegistrationPayment.findOne({ providerOrderId: order.order_id });
  if (!registration) { event.status = 'ignored'; await event.save(); return { ignored: true }; }
  event.payment = registration._id;
  try {
    await markCashfreePaymentPaid(registration, providerPayment, request);
    event.status = 'processed'; await event.save();
  } catch (error) {
    event.status = 'failed'; event.error = error.message; await event.save();
    throw error;
  }
  return { processed: true };
}

export async function listAdminPayments(query) {
  const page = Math.max(1, Number(query.page) || 1); const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const filter = {}; if (query.status) filter.status = query.status;
  const [items, total] = await Promise.all([
    ConnectorRegistrationPayment.find(filter).select('-passwordHash').populate('connectorUser', 'fullName email mobile').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ConnectorRegistrationPayment.countDocuments(filter),
  ]);
  return { items, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
}
