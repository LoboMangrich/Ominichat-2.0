import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Search, ShoppingCart, Phone, Mail, Calendar, ExternalLink, MessageSquare } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

function timeAgo(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return "agora mesmo";
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  if (diff < 172800) return "ontem";
  return d.toLocaleDateString("pt-BR");
}

export default function NewClients() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("7");

  const { data: events } = trpc.guru.getWebhookEvents.useQuery({ limit: 10 });
  const { data: customers, isLoading } = trpc.customers.list.useQuery({ page: 1, limit: 100 });

  // Filter customers created recently from Guru
  const now = new Date();
  const cutoff = new Date(now.getTime() - parseInt(dateFilter) * 24 * 60 * 60 * 1000);

  const newCustomers = (customers?.customers ?? []).filter(c => {
    const created = new Date(c.createdAt);
    if (created < cutoff) return false;
    if (search) {
      const s = search.toLowerCase();
      return (c.name ?? "").toLowerCase().includes(s) ||
        (c.email ?? "").toLowerCase().includes(s) ||
        (c.program ?? "").toLowerCase().includes(s);
    }
    return true;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const todayCount = newCustomers.filter(c => {
    const d = new Date(c.createdAt);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }).length;

  const guruCount = newCustomers.filter(c => c.guruContactId).length;

  return (

      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <UserPlus className="w-6 h-6 text-primary" />
              Novos Clientes
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Clientes que entraram recentemente via Digital Manager Guru
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Hoje</p>
                  <p className="text-3xl font-bold text-green-600">{todayCount}</p>
                </div>
                <UserPlus className="w-8 h-8 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Últimos {dateFilter} dias</p>
                  <p className="text-3xl font-bold text-blue-600">{newCustomers.length}</p>
                </div>
                <Calendar className="w-8 h-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Via Guru</p>
                  <p className="text-3xl font-bold text-purple-600">{guruCount}</p>
                </div>
                <ShoppingCart className="w-8 h-8 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email ou programa..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Hoje</SelectItem>
              <SelectItem value="2">Últimos 2 dias</SelectItem>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="14">Últimos 14 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Client List */}
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : newCustomers.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <UserPlus className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium text-muted-foreground">Nenhum novo cliente no período</p>
              <p className="text-sm text-muted-foreground mt-1">
                Configure o webhook da Guru para receber clientes automaticamente
              </p>
              <Button variant="outline" className="mt-4" onClick={() => navigate("/integrations")}>
                Configurar Guru
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {newCustomers.map(customer => (
              <Card key={customer.id} className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/customers/${customer.id}`)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-semibold text-primary">
                          {(customer.name ?? "?").charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-foreground">{customer.name ?? "Sem nome"}</span>
                          {customer.guruContactId && (
                            <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-xs">
                              <ShoppingCart className="w-3 h-3 mr-1" />
                              Guru
                            </Badge>
                          )}
                          {customer.program && (
                            <Badge variant="outline" className="text-xs">{customer.program}</Badge>
                          )}
                          <Badge
                            variant={customer.status === "Active" ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {customer.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                          {customer.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {customer.email}
                            </span>
                          )}
                          {customer.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {customer.phone}
                            </span>
                          )}
                          {customer.guruProductName && (
                            <span className="flex items-center gap-1 text-purple-600">
                              <ShoppingCart className="w-3 h-3" />
                              {customer.guruProductName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {timeAgo(customer.createdAt)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={e => {
                          e.stopPropagation();
                          navigate(`/conversations?customerId=${customer.id}`);
                        }}
                        className="gap-1"
                      >
                        <MessageSquare className="w-3 h-3" />
                        Chat
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Recent Guru Events */}
        {events && events.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Últimos Eventos da Guru
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {events.slice(0, 10).map((event: any) => (
                <div key={event.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      event.action === 'customer_created' ? 'bg-green-500' :
                      event.action === 'customer_updated' ? 'bg-blue-500' :
                      event.action === 'customer_churned' ? 'bg-red-500' : 'bg-gray-400'
                    }`} />
                    <div>
                      <span className="text-sm font-medium">{event.customerName ?? event.customerEmail}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {event.action === 'customer_created' ? '✓ Novo cliente criado' :
                         event.action === 'customer_updated' ? '↻ Atualizado' :
                         event.action === 'customer_churned' ? '✗ Cancelado' : event.action}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{timeAgo(event.createdAt)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

  );
}
