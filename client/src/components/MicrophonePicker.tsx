import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MicrophoneOption } from "@/hooks/useAudioRecorder";
import { ChevronUp } from "lucide-react";

// Seletor de microfone ao lado do botão de gravar (como no WhatsApp Desktop). Só
// aparece depois da primeira permissão: antes disso o navegador não informa os nomes.
const DEFAULT_VALUE = "__padrao__";

export default function MicrophonePicker({
  devices,
  deviceId,
  onChange,
  disabled,
}: {
  devices: MicrophoneOption[];
  deviceId: string | null;
  onChange: (deviceId: string | null) => void;
  disabled?: boolean;
}) {
  if (devices.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          className="-ml-1.5 flex h-9 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          title="Escolher microfone"
          aria-label="Escolher microfone"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="max-w-72">
        <DropdownMenuLabel className="text-xs">Microfone</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={deviceId ?? DEFAULT_VALUE}
          onValueChange={value => onChange(value === DEFAULT_VALUE ? null : value)}
        >
          <DropdownMenuRadioItem value={DEFAULT_VALUE} className="text-xs">
            Padrão do sistema
          </DropdownMenuRadioItem>
          {devices.map(d => (
            <DropdownMenuRadioItem key={d.deviceId} value={d.deviceId} className="text-xs">
              <span className="truncate">{d.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
