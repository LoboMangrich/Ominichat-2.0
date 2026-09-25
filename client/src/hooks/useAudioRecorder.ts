import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// Gravador de áudio do navegador (MediaRecorder), compartilhado entre o composer do
// canal próprio (ConversationDetail) e o da Sara (SaraComposer). Grava em
// audio/webm;codecs=opus — ver CLAUDE.md sobre confirmar se toca no WhatsApp.

export const RECORDED_AUDIO_MIME = "audio/webm";

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(100);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch {
      toast.error("Permissão de microfone negada");
    }
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr) { resolve(null); return; }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: RECORDED_AUDIO_MIME });
        mr.stream.getTracks().forEach(t => t.stop());
        resolve(blob);
      };
      mr.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    });
  }, []);

  const cancel = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== "inactive") {
      mr.stream.getTracks().forEach(t => t.stop());
      mr.stop();
    }
    setIsRecording(false);
    setDuration(0);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // Desmontou no meio da gravação (ex.: trocou de conversa): solta o microfone e o timer.
  useEffect(() => cancel, [cancel]);

  return { isRecording, duration, start, stop, cancel };
}
