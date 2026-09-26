// Vercel Serverless Function: Payment Webhook Handler (Compatibility Layer -> FloryAutoDonate Plugin)
import robokassaHandler from './robokassa-result.js';

export default async function handler(req, res) {
  // Delegate directly to Robokassa Result handler
  return robokassaHandler(req, res);
}
