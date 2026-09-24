import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Modal de etiquetas (criar/renomear/apagar). Extraído de Atendimentos.tsx sem mudança de
// comportamento, para ser usado também pela tela única de Conversas (/sara).
export type Tag = { id: number; name: string; slug: string | null; color: string | null; icon: string | null; isDefault: boolean | null };

export default function TagManagerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [newTagName, setNewTagName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const utils = trpc.useUtils();

  const { data: tags = [] } = trpc.tags.list.useQuery();
  const createTag = trpc.tags.create.useMutation({
    onSuccess: () => { utils.tags.list.invalidate(); setNewTagName(""); }
  });
  const updateTag = trpc.tags.update.useMutation({
    onSuccess: () => { utils.tags.list.invalidate(); setEditingId(null); }
  });
  const deleteTag = trpc.tags.delete.useMutation({
    onSuccess: () => utils.tags.list.invalidate()
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Gerenciar Tags</DialogTitle>
        </DialogHeader>
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {(tags as Tag[]).filter(t => t.name !== "Todos").map(tag => (
            <div key={tag.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/50">
              {editingId === tag.id ? (
                <>
                  <Input
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    className="flex-1 h-7 text-sm"
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === "Enter") updateTag.mutate({ id: tag.id, name: editingName });
                    }}
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600"
                    onClick={() => updateTag.mutate({ id: tag.id, name: editingName })}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7"
                    onClick={() => setEditingId(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{tag.name}</span>
                  {!tag.isDefault ? (
                    <>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
                        onClick={() => { setEditingId(tag.id); setEditingName(tag.name); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                        onClick={() => deleteTag.mutate({ id: tag.id })}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] h-4">padrão</Badge>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-3 border-t">
          <Input
            value={newTagName}
            onChange={e => setNewTagName(e.target.value)}
            placeholder="Nova tag (ex: Cristiano)..."
            className="flex-1 h-8 text-sm"
            onKeyDown={e => {
              if (e.key === "Enter" && newTagName.trim()) createTag.mutate({ name: newTagName.trim() });
            }}
          />
          <Button
            size="sm"
            className="bg-brand-600 hover:bg-brand-700 text-white shrink-0"
            disabled={!newTagName.trim() || createTag.isPending}
            onClick={() => createTag.mutate({ name: newTagName.trim() })}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
