/**
 * Health Score Engine
 * 
 * Calculates a 0-100 health score for each customer based on 5 weighted factors:
 * 
 * | Factor              | Weight | Data Source                        |
 * |---------------------|--------|------------------------------------|
 * | Inactivity          |  30%   | lastInteractionAt                  |
 * | NPS Score           |  25%   | npsScore field                     |
 * | Open Tickets        |  20%   | conversations table (open status)  |
 * | Renewal Proximity   |  15%   | renewalDate field                  |
 * | Program Progress    |  10%   | onboarding status (proxy: age)     |
 */

import { eq, sql } from "drizzle-orm";
import { customers, healthScoreLogs, conversations } from "../drizzle/schema";
import type { MySql2Database } from "drizzle-orm/mysql2";

export interface HealthScoreBreakdown {
  inactivity: number;        // 0-100 score for this factor
  nps: number;               // 0-100 score for this factor
  openTickets: number;       // 0-100 score for this factor
  renewalProximity: number;  // 0-100 score for this factor
  programProgress: number;   // 0-100 score for this factor
  // Raw values for display
  inactivityDays: number;
  npsRaw: number | null;
  openTicketsCount: number;
  renewalDaysLeft: number | null;
}

export interface HealthScoreResult {
  customerId: number;
  score: number;
  breakdown: HealthScoreBreakdown;
}

/**
 * Calculate health score for a single customer
 */
export async function calculateHealthScore(
  db: MySql2Database<any>,
  customerId: number
): Promise<HealthScoreResult> {
  const now = new Date();

  // Fetch customer data
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!customer) throw new Error(`Customer ${customerId} not found`);

  // ── Factor 1: Inactivity (30%) ────────────────────────────────────────────
  // 0 days = 100 points, 7 days = 80, 14 days = 50, 30 days = 10, 60+ days = 0
  const inactivityDays = customer.lastInteractionAt
    ? Math.floor((now.getTime() - new Date(customer.lastInteractionAt).getTime()) / (1000 * 60 * 60 * 24))
    : 60; // no interaction ever = worst case

  let inactivityScore: number;
  if (inactivityDays <= 1) inactivityScore = 100;
  else if (inactivityDays <= 3) inactivityScore = 95;
  else if (inactivityDays <= 7) inactivityScore = 80;
  else if (inactivityDays <= 14) inactivityScore = 60;
  else if (inactivityDays <= 21) inactivityScore = 40;
  else if (inactivityDays <= 30) inactivityScore = 20;
  else if (inactivityDays <= 45) inactivityScore = 10;
  else inactivityScore = 0;

  // ── Factor 2: NPS Score (25%) ─────────────────────────────────────────────
  // NPS 9-10 = 100, NPS 7-8 = 70, NPS 4-6 = 40, NPS 0-3 = 0, no NPS = 60 (neutral)
  const npsRaw = customer.npsScore ?? null;
  let npsScore: number;
  if (npsRaw === null) npsScore = 60; // neutral when no NPS
  else if (npsRaw >= 9) npsScore = 100;
  else if (npsRaw >= 7) npsScore = 70;
  else if (npsRaw >= 4) npsScore = 40;
  else npsScore = 0;

  // ── Factor 3: Open Tickets (20%) ─────────────────────────────────────────
  // 0 open = 100, 1 open = 70, 2 open = 40, 3+ open = 10
  const [ticketCount] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(conversations)
    .where(sql`customerId = ${customerId} AND status IN ('Open', 'Waiting')`);

  const openTicketsCount = Number(ticketCount?.count ?? 0);
  let openTicketsScore: number;
  if (openTicketsCount === 0) openTicketsScore = 100;
  else if (openTicketsCount === 1) openTicketsScore = 70;
  else if (openTicketsCount === 2) openTicketsScore = 40;
  else openTicketsScore = 10;

  // ── Factor 4: Renewal Proximity (15%) ────────────────────────────────────
  // No renewal date = 80 (neutral), 90+ days = 100, 60 days = 85, 30 days = 70,
  // 14 days = 50, 7 days = 30, 3 days = 10, overdue = 0
  let renewalDaysLeft: number | null = null;
  let renewalScore: number;
  if (!customer.renewalDate) {
    renewalScore = 80; // neutral — no renewal configured
  } else {
    renewalDaysLeft = Math.floor(
      (new Date(customer.renewalDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (renewalDaysLeft < 0) renewalScore = 0;       // overdue
    else if (renewalDaysLeft <= 3) renewalScore = 10;
    else if (renewalDaysLeft <= 7) renewalScore = 30;
    else if (renewalDaysLeft <= 14) renewalScore = 50;
    else if (renewalDaysLeft <= 30) renewalScore = 70;
    else if (renewalDaysLeft <= 60) renewalScore = 85;
    else renewalScore = 100;
  }

  // ── Factor 5: Program Progress (10%) ─────────────────────────────────────
  // Proxy: customer age in days. New customers (0-7 days) get 60 (neutral),
  // 8-30 days = 70, 31-90 days = 85, 90+ days = 100
  // This will be replaced by actual onboarding milestone tracking in the future
  const customerAgeDays = Math.floor(
    (now.getTime() - new Date(customer.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  let programProgressScore: number;
  if (customerAgeDays <= 7) programProgressScore = 60;
  else if (customerAgeDays <= 30) programProgressScore = 70;
  else if (customerAgeDays <= 90) programProgressScore = 85;
  else programProgressScore = 100;

  // ── Weighted Final Score ──────────────────────────────────────────────────
  const score = Math.round(
    inactivityScore * 0.30 +
    npsScore * 0.25 +
    openTicketsScore * 0.20 +
    renewalScore * 0.15 +
    programProgressScore * 0.10
  );

  const breakdown: HealthScoreBreakdown = {
    inactivity: inactivityScore,
    nps: npsScore,
    openTickets: openTicketsScore,
    renewalProximity: renewalScore,
    programProgress: programProgressScore,
    inactivityDays,
    npsRaw,
    openTicketsCount,
    renewalDaysLeft,
  };

  return { customerId, score, breakdown };
}

/**
 * Calculate and persist health score for a single customer
 */
export async function recalculateAndSave(
  db: MySql2Database<any>,
  customerId: number
): Promise<HealthScoreResult> {
  const result = await calculateHealthScore(db, customerId);

  // Persist to healthScoreLogs
  await db.insert(healthScoreLogs).values({
    customerId: result.customerId,
    score: result.score,
    breakdown: result.breakdown,
  });

  // Update the customer's healthScore field
  await db
    .update(customers)
    .set({ healthScore: result.score })
    .where(eq(customers.id, customerId));

  return result;
}

/**
 * Recalculate health scores for ALL active customers
 * Called by the daily cron job
 */
export async function recalculateAllHealthScores(
  db: MySql2Database<any>
): Promise<{ updated: number; errors: number }> {
  const allActive = await db
    .select({ id: customers.id })
    .from(customers)
    .where(sql`status IN ('Active', 'At Risk', 'New')`);

  let updated = 0;
  let errors = 0;

  for (const c of allActive) {
    try {
      await recalculateAndSave(db, c.id);
      updated++;
    } catch (e) {
      console.error(`[HealthScore] Error for customer ${c.id}:`, e);
      errors++;
    }
  }

  return { updated, errors };
}
