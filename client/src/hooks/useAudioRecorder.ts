import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// Gravador de áudio do navegador (MediaRecorder), compartilhado entre o composer do
// canal próprio (ConversationDetail) e o da Sara (SaraComposer). Grava em
// audio/webm;codecs=opus quando o navegador suporta — no teste real de 25/09 o webm
// chegou e tocou no WhatsApp do cliente pela Sara.
//
// Microfone: cada erro do getUserMedia tem mensagem própria (antes, qualquer falha
// virava "permissão negada"), e dá para escolher o dispositivo, como no WhatsApp
// Desktop. A escolha fica no localStorage; se o dispositivo salvo sumir, usa o padrão.

export const RECORDED_AUDIO_MIME = "audio/webm";
const PREFERRED_RECORDER_MIME = "audio/webm;codecs=opus";
export const MICROPHONE_STORAGE_KEY = "microfone.deviceId";

export const MICROPHONE_ERROR_MESSAGES = {
  NotAllowedError: "Permissão do microfone negada. Clique no cadeado da barra de endereço → Microfone → Permitir.",
  NotFoundError: "Nenhum microfone encontrado.",
  NotReadableError: "O microfone está em uso por outro programa.",
} as const;
export const MICROPHONE_GENERIC_ERROR = "Não foi possível usar o microfone.";

/** Mensagem para o atendente a partir do erro do getUserMedia/MediaRecorder. */
export function microphoneErrorMessage(error: unknown): string {
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "SecurityError") return MICROPHONE_ERROR_MESSAGES.NotAllowedError;
  if (name === "TrackStartError") return MICROPHONE_ERROR_MESSAGES.NotReadableError; // nome antigo do Chrome
  if (typeof name === "string" && name in MICROPHONE_ERROR_MESSAGES) {
    return MICROPHONE_ERROR_MESSAGES[name as keyof typeof MICROPHONE_ERROR_MESSAGES];
  }
  return MICROPHONE_GENERIC_ERROR;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function safeStorage(): StorageLike | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

export function readSavedMicrophone(storage: StorageLike | undefined): string | null {
  try {
    return storage?.getItem(MICROPHONE_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function saveMicrophone(storage: StorageLike | undefined, deviceId: string | null): void {
  try {
    if (!storage) return;
    if (deviceId) storage.setItem(MICROPHONE_STORAGE_KEY, deviceId);
    else storage.removeItem(MICROPHONE_STORAGE_KEY);
  } catch {
    // navegação privada / armazenamento bloqueado: a escolha só vale nesta sessão
  }
}

/** Dispositivo a usar: o salvo, se ainda existir; senão o padrão (null). */
export function resolveMicrophone(saved: string | null, devices: Array<{ deviceId: string }>): string | null {
  if (!saved) return null;
  return devices.some(d => d.deviceId === saved) ? saved : null;
}

export function audioConstraints(deviceId: string | null): MediaTrackConstraints | true {
  return deviceId ? { deviceId: { exact: deviceId } } : true;
}

export interface MicrophoneOption {
  deviceId: string;
  label: string;
}

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [devices, setDevices] = useState<MicrophoneOption[]>([]);
  const [deviceId, setDeviceIdState] = useState<string | null>(() => readSavedMicrophone(safeStorage()));
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Os nomes só vêm depois da primeira permissão; antes disso a lista fica vazia e o
  // seletor não aparece. Atualiza ao plugar/desplugar.
  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all
        .filter(d => d.kind === "audioinput" && d.label && d.deviceId !== "default" && d.deviceId !== "communications")
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microfone ${i + 1}` }));
      setDevices(inputs);
      // Lista vazia = ainda sem permissão (sem nomes/ids): mantém a escolha salva.
      if (inputs.length === 0) return;
      // Salvo sumiu (desplugado): cai no padrão, sem apagar a escolha do atendente —
      // se ele plugar de novo, volta a ser usado.
      setDeviceIdState(current => resolveMicrophone(current ?? readSavedMicrophone(safeStorage()), inputs));
    } catch {
      setDevices([]);
    }
  }, []);

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    void refreshDevices();
    md.addEventListener("devicechange", refreshDevices);
    return () => md.removeEventListener("devicechange", refreshDevices);
  }, [refreshDevices]);

  const setDeviceId = useCallback((id: string | null) => {
    setDeviceIdState(id);
    saveMicrophone(safeStorage(), id);
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error(MICROPHONE_GENERIC_ERROR);
      return;
    }
    let stream: MediaStream;
    try {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(deviceId) });
      } catch (error) {
        // Dispositivo escolhido não existe mais: tenta o padrão antes de desistir.
        const name = (error as { name?: string }).name;
        if (!deviceId || (name !== "OverconstrainedError" && name !== "NotFoundError")) throw error;
        setDeviceIdState(null);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (error) {
      toast.error(microphoneErrorMessage(error));
      return;
    }

    try {
      const options =
        typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(PREFERRED_RECORDER_MIME)
          ? { mimeType: PREFERRED_RECORDER_MIME }
          : undefined;
      const mr = new MediaRecorder(stream, options);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(100);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
      void refreshDevices(); // agora com permissão, os nomes aparecem
    } catch (error) {
      stream.getTracks().forEach(t => t.stop()); // não deixa o microfone aberto
      toast.error(microphoneErrorMessage(error));
    }
  }, [deviceId, refreshDevices]);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr) { resolve(null); return; }
      mr.onstop = () => {
        const type = mr.mimeType ? mr.mimeType.split(";")[0] : RECORDED_AUDIO_MIME;
        const blob = new Blob(chunksRef.current, { type });
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

  return { isRecording, duration, start, stop, cancel, devices, deviceId, setDeviceId };
}
