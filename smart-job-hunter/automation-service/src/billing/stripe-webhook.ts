// =============================================
// Stripe Webhook Handler
// =============================================

import { query } from '../db/postgres-client';
import { logger } from '../utils/logging';

// Stripe event types we handle
export async function handleStripeWebhook(event: {
  type: string;
  data: { object: Record<string, any> };
}): Promise<void> {
  const { type, data } = event;

  switch (type) {
    case 'checkout.session.completed': {
      const session = data.object;
      await activateSubscription(
        session.client_reference_id,   // userId
        session.customer,              // stripe customer ID
        session.subscription,          // stripe subscription ID
      );
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = data.object;
      await recordPayment(invoice);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = data.object;
      await handlePaymentFailed(invoice.subscription);
      break;
    }

    case 'customer.subscription.updated': {
      const sub = data.object;
      await updateSubscriptionStatus(sub.id, sub.status, sub.cancel_at_period_end);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = data.object;
      await cancelSubscription(sub.id);
      break;
    }

    default:
      logger.debug(`Unhandled Stripe event: ${type}`);
  }
}

async function activateSubscription(userId: string, customerId: string, subscriptionId: string): Promise<void> {
  // Look up the plan from Stripe price
  await query(
    `UPDATE subscriptions
     SET stripe_customer_id = $2,
         stripe_subscription_id = $3,
         status = 'active',
         plan_id = COALESCE(
           (SELECT p.id FROM plans p WHERE p.stripe_price_id IS NOT NULL LIMIT 1),
           plan_id
         ),
         updated_at = NOW()
     WHERE user_id = $1`,
    [userId, customerId, subscriptionId],
  );
  logger.info(`Subscription activated for user ${userId}`);
}

async function recordPayment(invoice: Record<string, any>): Promise<void> {
  await query(
    `INSERT INTO payments (user_id, stripe_payment_id, amount_cents, currency, status)
     SELECT s.user_id, $1, $2, $3, 'succeeded'
     FROM subscriptions s WHERE s.stripe_subscription_id = $4
     ON CONFLICT (stripe_payment_id) DO NOTHING`,
    [invoice.id, invoice.amount_paid, invoice.currency, invoice.subscription],
  );
}

async function handlePaymentFailed(subscriptionId: string): Promise<void> {
  await query(
    `UPDATE subscriptions SET status = 'past_due', updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscriptionId],
  );
  logger.warn(`Payment failed for subscription ${subscriptionId}`);
}

async function updateSubscriptionStatus(
  subscriptionId: string,
  status: string,
  cancelAtPeriodEnd: boolean,
): Promise<void> {
  await query(
    `UPDATE subscriptions
     SET status = $2, cancel_at_period_end = $3, updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscriptionId, status, cancelAtPeriodEnd],
  );
}

async function cancelSubscription(subscriptionId: string): Promise<void> {
  // Downgrade to free plan
  await query(
    `UPDATE subscriptions
     SET plan_id = (SELECT id FROM plans WHERE name = 'free'),
         status = 'cancelled',
         stripe_subscription_id = NULL,
         updated_at = NOW()
     WHERE stripe_subscription_id = $1`,
    [subscriptionId],
  );
  logger.info(`Subscription ${subscriptionId} cancelled, downgraded to free`);
}
