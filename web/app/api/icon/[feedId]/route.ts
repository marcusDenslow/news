import { getIcon } from "@/lib/miniflux";

export async function GET(_req: Request, ctx: RouteContext<"/api/icon/[feedId]">) {
  const { feedId } = await ctx.params;
  const icon = await getIcon(Number(feedId));
  if (!icon) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(icon.bytes), {
    headers: {
      "Content-Type": icon.mime,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
