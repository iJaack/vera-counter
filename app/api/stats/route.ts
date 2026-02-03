import { NextResponse } from "next/server";
import { getVerifierAllianceStats } from "@/lib/verifier-alliance";

export const revalidate = 3600;

export async function GET() {
  try {
    const data = await getVerifierAllianceStats();

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: "Failed to fetch Verifier Alliance listing.",
        message,
      },
      { status: 500 },
    );
  }
}
