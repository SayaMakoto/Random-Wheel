import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RouteProps {
  params: Promise<{ id: string }>;
}

// A deliberately small public payload used by the wheel screen to pick up
// administrator edits without requiring visitors to refresh their browser.
export async function GET(request: Request, { params }: RouteProps) {
  const { id } = await params;
  const wheel = await db.wheel.findUnique({
    where: { id },
    select: {
      name: true,
      slices: true,
      hideOnWin: true,
      backgroundImage: true,
      isDeleted: true,
      updatedAt: true,
    },
  });

  if (!wheel || wheel.isDeleted) return Response.json({ error: "Không tìm thấy vòng quay." }, { status: 404 });

  const updatedAtStr = wheel.updatedAt.toISOString();
  const ifNoneMatch = request.headers.get("if-none-match");

  // Conditional request: if the wheel hasn't changed, return 304 Not Modified with empty body
  if (ifNoneMatch && ifNoneMatch === updatedAtStr) {
    return new Response(null, {
      status: 304,
      headers: {
        "ETag": updatedAtStr,
        "Cache-Control": "no-cache",
      },
    });
  }

  return Response.json(
    {
      name: wheel.name,
      slices: wheel.slices,
      hideOnWin: wheel.hideOnWin,
      backgroundImage: wheel.backgroundImage,
      updatedAt: updatedAtStr,
    },
    {
      headers: {
        "ETag": updatedAtStr,
        "Cache-Control": "no-cache",
      },
    }
  );
}
