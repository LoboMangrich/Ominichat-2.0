import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Check, Tag, X } from "lucide-react";
import { toast } from "sonner";
import type { Tag as ConversationTag } from "./TagManagerModal";

// Etiquetas personalizadas (conversationTags sem slug) numa conversa da Sara — só no
// Cashmiles. As de status (Em Aberto/Aguardando/Grupos) vêm do status real e não são
// atribuíveis. Obs.: o botão "Etiqueta" do canal próprio grava texto livre em
// conversationLabels, outra coisa (ver CLAUDE.md) — não foi mexido.

function useSaraTags(conversationId: string) {
  const utils = trpc.useUtils();
  const { data: assigned = [] } = trpc.sara.listConversationTags.useQuery({ conversationId });
  const { data: allTags = [] } = trpc.tags.list.useQuery();
  const customTags = (allTags as ConversationTag[]).filter(t => !t.slug && t.name !== "Todos");

  const invalidate = () => {
    utils.sara.listConversationTags.invalidate({ conversationId });
    utils.sara.listTaggedConversations.invalidate();
  };
  const add = trpc.sara.addTag.useMutation({ onSuccess: invalidate, onError: e => toast.error(e.message) });
  const remove = trpc.sara.removeTag.useMutation({ onSuccess: invalidate, onError: e => toast.error(e.message) });

  return { assigned, customTags, add, remove };
}

/** Botão "Etiqueta" (barra do composer): liga/desliga etiquetas personalizadas. */
export function SaraTagPicker({ conversationId }: { conversationId: string }) {
  const { assigned, customTags, add, remove } = useSaraTags(conversationId);
  const assignedIds = new Set(assigned.map(t => t.tagId));

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          title="Adicionar etiqueta"
        >
          <Tag className="w-3 h-3" /> Etiqueta
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        {customTags.length === 0 ? (
          <p className="p-2 text-xs text-muted-foreground">
            Nenhuma etiqueta personalizada. Crie pela engrenagem da lista de conversas.
          </p>
        ) : (
          customTags.map(tag => {
            const on = assignedIds.has(tag.id);
            return (
              <button
                key={tag.id}
                disabled={add.isPending || remove.isPending}
                onClick={() =>
                  on
                    ? remove.mutate({ conversationId, tagId: tag.id })
                    : add.mutate({ conversationId, tagId: tag.id })
                }
                className={cn(
                  "w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                  on && "font-medium",
                )}
              >
                <span className="truncate">{tag.name}</span>
                {on && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
              </button>
            );
          })
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Faixa com as etiquetas da conversa, no topo do chat. */
export function SaraTagStrip({ conversationId }: { conversationId: string }) {
  const { assigned, remove } = useSaraTags(conversationId);
  if (assigned.length === 0) return null;
  return (
    <div className="flex gap-1.5 mb-2 flex-wrap justify-center">
      {assigned.map(tag => (
        <span
          key={tag.tagId}
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-card text-foreground"
        >
          <Tag className="w-3 h-3 text-muted-foreground" /> {tag.name}
          <button
            onClick={() => remove.mutate({ conversationId, tagId: tag.tagId })}
            className="text-muted-foreground hover:text-foreground"
            title="Remover etiqueta"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
