import { useState, useEffect, useCallback } from "react";

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [lastError, setLastError] = useState("");

  const checkStatus = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPermission("unsupported");
      setIsLoading(false);
      return;
    }

    setPermission(Notification.permission);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error("Error al verificar estado de push:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribe = async () => {
    if (permission === "unsupported") return false;

    setIsLoading(true);
    setLastError("");
    try {
      // 1. Pedir permiso si no tenemos
      if (Notification.permission !== "granted") {
        const newPermission = await Notification.requestPermission();
        setPermission(newPermission);
        if (newPermission !== "granted") {
          setIsLoading(false);
          return false;
        }
      }

      // 2. Obtener la clave publica del servidor
      const keyRes = await fetch("/api/v1/notificaciones/push/keys");
      const keyPayload = (await keyRes.json().catch(() => ({}))) as {
        publicKey?: string;
        error?: string;
        missingEnv?: string[];
      };
      if (!keyRes.ok) {
        const missing = Array.isArray(keyPayload.missingEnv) && keyPayload.missingEnv.length > 0
          ? ` (${keyPayload.missingEnv.join(", ")})`
          : "";
        throw new Error(
          `${keyPayload.error ?? "No se pudo obtener la clave VAPID del servidor."}${missing}`
        );
      }
      const publicKey = keyPayload.publicKey;
      if (!publicKey) throw new Error("No se pudo obtener la clave VAPID");

      // 3. Suscribir en el navegador
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      // 4. Enviar al backend
      const res = await fetch("/api/v1/notificaciones/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription,
          userAgent: navigator.userAgent
        })
      });

      if (res.ok) {
        setIsSubscribed(true);
        return true;
      }
      const subscribePayload = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(subscribePayload.error ?? "No se pudo registrar la suscripcion push.");
    } catch (error) {
      console.error("Error al suscribir:", error);
      setLastError(error instanceof Error ? error.message : "No se pudo activar notificaciones push.");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async () => {
    setIsLoading(true);
    setLastError("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // 1. Avisar al backend
        await fetch("/api/v1/notificaciones/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });

        // 2. Desuscribir en el navegador
        await subscription.unsubscribe();
        setIsSubscribed(false);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error al desuscribir:", error);
      setLastError(error instanceof Error ? error.message : "No se pudo desactivar notificaciones push.");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    permission,
    isSubscribed,
    isLoading,
    lastError,
    subscribe,
    unsubscribe,
    refresh: checkStatus
  };
}
