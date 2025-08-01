import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();

    // Get password from server-side environment variable (no NEXT_PUBLIC_ prefix)
    const correctPassword = process.env.MINIDEV_PASSWORD || "minidev2024";

    if (password === correctPassword) {
      // Generate a session token (in a real app, you'd use JWT or similar)
      const sessionToken = crypto.randomUUID();

      return NextResponse.json({
        success: true,
        message: "Authentication successful",
        sessionToken,
      });
    } else {
      return NextResponse.json(
        { success: false, message: "Invalid password" },
        { status: 401 }
      );
    }
  } catch {
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
