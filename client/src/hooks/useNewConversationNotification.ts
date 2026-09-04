import { useEffect, useRef, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";

// status é o valor real do enum conversations.status (drizzle/schema.ts) — nunca o rótulo em
// português, senão o filtro em conversations.list não retorna nada.
export const OPEN_CONVERSATIONS_POLL_INPUT = { status: "Open", page: 1, limit: 1 } as const;

/**
 * Hook que monitora novos atendimentos abertos e emite notificação sonora
 * usando Web Audio API (sem dependências externas).
 * Solicita permissão de notificação do navegador na primeira vez.
 */
export function useNewConversationNotification() {
  const [enabled, setEnabled] = useState(() => {
    return localStorage.getItem("cs-notif-enabled") !== "false";
  });
  const [permissionGranted, setPermissãoGranted] = useState(false);
  const lastCountRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Poll open conversations count every 15s
  const { data } = trpc.conversations.list.useQuery(
    OPEN_CONVERSATIONS_POLL_INPUT,
    { refetchInterval: enabled ? 15_000 : false }
  );

  const playNotificationSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }
      const ctx = audioCtxRef.current;
      // WhatsApp-like double beep
      const playBeep = (startTime: number, freq: number, duration: number) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(freq, startTime);
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };
      const now = ctx.currentTime;
      playBeep(now, 880, 0.15);
      playBeep(now + 0.2, 1100, 0.15);
    } catch {
      // AudioContext not available (e.g., SSR or blocked)
    }
  }, []);

  const showBrowserNotification = useCallback((count: number) => {
    if (!permissionGranted) return;
    try {
      new Notification("Novo Atendimento", {
        body: `Você tem ${count} atendimento${count > 1 ? "s" : ""} aberto${count > 1 ? "s" : ""} aguardando.`,
        icon: "/favicon.ico",
        tag: "new-conversation",
      });
    } catch {
      // Notifications not supported
    }
  }, [permissionGranted]);

  // Request browser notification permission
  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermissãoGranted(result === "granted");
  }, []);

  // Check permission on mount
  useEffect(() => {
    if ("Notification" in window) {
      setPermissãoGranted(Notification.permission === "granted");
    }
  }, []);

  // Detect new conversations
  useEffect(() => {
    if (!enabled || !data) return;
    const currentCount = data.total;
    if (lastCountRef.current !== null && currentCount > lastCountRef.current) {
      playNotificationSound();
      showBrowserNotification(currentCount);
    }
    lastCountRef.current = currentCount;
  }, [data, enabled, playNotificationSound, showBrowserNotification]);

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      localStorage.setItem("cs-notif-enabled", String(next));
      if (next) requestPermission();
      return next;
    });
  }, [requestPermission]);

  return { enabled, toggle, requestPermission, permissionGranted };
}
