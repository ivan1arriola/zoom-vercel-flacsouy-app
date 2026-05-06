import { POST as zoomWebhookPost } from "../api/v1/zoom/webhook/route";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return zoomWebhookPost(request);
}
