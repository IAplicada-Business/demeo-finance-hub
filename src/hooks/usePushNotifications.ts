// Aurora · Hook usePushNotifications
// Scaffold — não exposto em nenhum UI ainda.
// Ativar após configurar VAPID keys e deploy das edge functions subscribe-push / send-push.

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

export function usePushNotifications() {
  const [isSupported] = useState(() => "serviceWorker" in navigator && "PushManager" in window);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isSupported || !VAPID_PUBLIC_KEY) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setIsSubscribed(!!sub);
      });
    });
  }, [isSupported]);

  async function subscribe(userEmail?: string) {
    if (!isSupported || !VAPID_PUBLIC_KEY) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
      const key = sub.getKey("p256dh");
      const authKey = sub.getKey("auth");
      if (!key || !authKey) throw new Error("Chaves de push não disponíveis");

      const { error } = await supabase().functions.invoke("subscribe-push", {
        body: {
          endpoint: sub.endpoint,
          p256dh: btoa(String.fromCharCode(...new Uint8Array(key))),
          auth: btoa(String.fromCharCode(...new Uint8Array(authKey))),
          user_email: userEmail,
        },
      });
      if (error) throw error;
      setIsSubscribed(true);
    } finally {
      setLoading(false);
    }
  }

  async function unsubscribe() {
    if (!isSupported) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return;
      await sub.unsubscribe();
      await supabase().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      setIsSubscribed(false);
    } finally {
      setLoading(false);
    }
  }

  return { isSupported, isSubscribed, loading, subscribe, unsubscribe };
}
