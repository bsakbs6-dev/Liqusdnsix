// Vercel Serverless Function: Universal Payment Webhook Router (Supports RollyPay & Robokassa)
import rollypayHandler from './rollypay-webhook.js';
import robokassaHandler from './robokassa-result.js';

export default async function handler(req, res) {
  // If request contains RollyPay signature headers, route to RollyPay handler
  if (req.headers['x-signature'] || req.headers['X-Signature']) {
    return rollypayHandler(req, res);
  }

  // Otherwise route to Robokassa handler
  return robokassaHandler(req, res);
}
