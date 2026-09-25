import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MICROPHONE_GENERIC_ERROR,
  MICROPHONE_STORAGE_KEY,
  audioConstraints,
  microphoneErrorMessage,
  readSavedMicrophone,
  resolveMicrophone,
  saveMicrophone,
} from "./useAudioRecorder";

const hook = readFileSync(new URL("./useAudioRecorder.ts", import.meta.url), "utf-8");
const saraComposer = readFileSync(new URL("../components/conversations/SaraComposer.tsx", import.meta.url), "utf-8");
const legacyDetail = readFileSync(new URL("../pages/ConversationDetail.tsx", import.meta.url), "utf-8");

const err = (name: string) => Object.assign(new Error(name), { name });

describe("microphoneErrorMessage — cada erro do getUserMedia com mensagem própria", () => {
  it("NotAllowedError → instrução do cadeado", () => {
    expect(microphoneErrorMessage(err("NotAllowedError"))).toBe(
      "Permissão do microfone negada. Clique no cadeado da barra de endereço → Microfone → Permitir.",
    );
  });
  it("NotFoundError → nenhum microfone", () => {
    expect(microphoneErrorMessage(err("NotFoundError"))).toBe("Nenhum microfone encontrado.");
  });
  it("NotReadableError (e o antigo TrackStartError) → em uso por outro programa", () => {
    expect(microphoneErrorMessage(err("NotReadableError"))).toBe("O microfone está em uso por outro programa.");
    expect(microphoneErrorMessage(err("TrackStartError"))).toBe("O microfone está em uso por outro programa.");
  });
  it("outros → genérica (não mais \"permissão negada\" para tudo)", () => {
    expect(microphoneErrorMessage(err("NotSupportedError"))).toBe(MICROPHONE_GENERIC_ERROR);
    expect(microphoneErrorMessage(new Error("x"))).toBe(MICROPHONE_GENERIC_ERROR);
    expect(microphoneErrorMessage(null)).toBe(MICROPHONE_GENERIC_ERROR);
  });
});

describe("Escolha do microfone", () => {
  function memoryStorage() {
    const data = new Map<string, string>();
    return {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
      data,
    };
  }

  it("salva e lê do localStorage; null volta ao padrão", () => {
    const s = memoryStorage();
    saveMicrophone(s, "mic-2");
    expect(s.data.get(MICROPHONE_STORAGE_KEY)).toBe("mic-2");
    expect(readSavedMicrophone(s)).toBe("mic-2");
    saveMicrophone(s, null);
    expect(readSavedMicrophone(s)).toBeNull();
  });

  it("storage que lança (navegação privada) não quebra", () => {
    const broken = {
      getItem: () => { throw new Error("bloqueado"); },
      setItem: () => { throw new Error("bloqueado"); },
      removeItem: () => { throw new Error("bloqueado"); },
    };
    expect(readSavedMicrophone(broken)).toBeNull();
    expect(() => saveMicrophone(broken, "mic-2")).not.toThrow();
    expect(readSavedMicrophone(undefined)).toBeNull();
  });

  it("dispositivo salvo que sumiu → padrão", () => {
    const devices = [{ deviceId: "mic-1" }, { deviceId: "mic-2" }];
    expect(resolveMicrophone("mic-2", devices)).toBe("mic-2");
    expect(resolveMicrophone("mic-9", devices)).toBeNull();
    expect(resolveMicrophone(null, devices)).toBeNull();
  });

  it("deviceId vai no getUserMedia; sem escolha, padrão", () => {
    expect(audioConstraints("mic-2")).toEqual({ deviceId: { exact: "mic-2" } });
    expect(audioConstraints(null)).toBe(true);
  });

  it("dispositivo escolhido indisponível na hora de gravar → tenta o padrão", () => {
    expect(hook).toMatch(/name !== "OverconstrainedError" && name !== "NotFoundError"[\s\S]*?getUserMedia\(\{ audio: true \}\)/);
  });

  it("falha depois da permissão fecha o microfone", () => {
    expect(hook).toContain("stream.getTracks().forEach(t => t.stop()); // não deixa o microfone aberto");
  });

  it("seletor nas duas telas (hook compartilhado)", () => {
    expect(saraComposer).toContain("<MicrophonePicker");
    expect(legacyDetail).toContain("<MicrophonePicker");
  });
});
