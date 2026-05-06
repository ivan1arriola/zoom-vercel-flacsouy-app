import {
  GET as zoomWebhookGet,
  POST as zoomWebhookPost
} from "../api/v1/zoom/webhook/route";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return zoomWebhookPost(request);
}

export async function GET() {
  return zoomWebhookGet();
}
