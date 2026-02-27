import { NextResponse } from "next/server";
import { getVerifiedContractsDailyData } from "@/lib/verified-contracts-daily";

export const revalidate = 3600;

export async function GET() {
  try {
    const data = await getVerifiedContractsDailyData();

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      {
        error: "Failed to load verified contracts daily counts.",
        message,
      },
      { status: 500 },
    );
  }
}
