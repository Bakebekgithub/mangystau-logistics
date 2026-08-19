import { NextResponse } from "next/server";

import { regenerateProposals } from "@/lib/planning";

export const dynamic = "force-dynamic";
/** A full fleet plan takes seconds; give the platform room before it times out. */
export const maxDuration = 60;

/**
 * Runs a planning cycle: clears outstanding proposals and builds fresh ones from
 * the current order pool. Trips a driver already accepted are untouched.
 */
export async function POST() {
  const summary = await regenerateProposals();
  return NextResponse.json(summary);
}
