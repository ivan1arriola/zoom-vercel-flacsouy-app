import webpush from "web-push";
import { db } from "@/src/lib/db";

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@flacso.edu.uy";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
};

function isExpiredPushSubscriptionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return statusCode === 410 || statusCode === 404;
}

export async function sendPushNotification(
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  },
  payload: PushPayload
) {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth
        }
      },
      JSON.stringify(payload)
    );
    return { success: true };
  } catch (error) {
    console.error("Error enviando notificacion push:", error);
    if (isExpiredPushSubscriptionError(error)) {
      // Subscripcion expirada o invalida
      return { success: false, expired: true };
    }
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function getVapidPublicKey() {
  return vapidPublicKey;
}

export function getVapidConfigStatus() {
  const missingEnv: string[] = [];
  if (!vapidPublicKey) missingEnv.push("VAPID_PUBLIC_KEY");
  if (!vapidPrivateKey) missingEnv.push("VAPID_PRIVATE_KEY");

  return {
    isConfigured: missingEnv.length === 0,
    missingEnv,
    subject: vapidSubject
  };
}


export async function sendPushToUser(userId: string, payload: PushPayload) {
  const subscriptions = await db.pushSubscription.findMany({
    where: { userId }
  });

  if (subscriptions.length === 0) return { count: 0 };

  const results = await Promise.all(
    subscriptions.map(async (sub) => {
      const result = await sendPushNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        },
        payload
      );

      if (result.expired) {
        await db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      }

      return result.success;
    })
  );

  return { count: results.filter(Boolean).length };
}

export async function sendPushToUserByEmail(email: string, payload: PushPayload) {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true }
  });
  if (!user) return { count: 0 };
  return sendPushToUser(user.id, payload);
}
