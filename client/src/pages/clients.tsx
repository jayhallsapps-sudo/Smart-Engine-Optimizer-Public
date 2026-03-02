import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Globe,
  BarChart3,
  Phone,
  Tag,
  Target,
  FileText,
  Pencil,
  Trash2,
  Building2,
} from "lucide-react";
import type { Client } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [input, setInput] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const trimmed = input.trim();
      if (trimmed && !value.includes(trimmed)) {
        onChange([...value, trimmed]);
      }
      setInput("");
    }
    if (e.key === "Backspace" && !input && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 min-h-[36px] rounded-md border bg-background px-3 py-1.5">
      {value.map((tag, idx) => (
        <Badge
          key={idx}
          variant="secondary"
          className="text-xs cursor-pointer"
          onClick={() => onChange(value.filter((_, i) => i !== idx))}
        >
          {tag}
          <span className="ml-1 opacity-50">x</span>
        </Badge>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[100px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  );
}

interface ClientFormData {
  name: string;
  gscSiteUrl: string;
  ga4PropertyId: string;
  callrailCompanyId: string;
  brandTerms: string[];
  leadEvents: string[];
  moneyPages: string[];
  callrailOrganicSourceTerms: string[];
}

const emptyForm: ClientFormData = {
  name: "",
  gscSiteUrl: "",
  ga4PropertyId: "",
  callrailCompanyId: "",
  brandTerms: [],
  leadEvents: [],
  moneyPages: [],
  callrailOrganicSourceTerms: ["google / organic"],
};

function ClientForm({ initial, onSubmit, isPending }: { initial: ClientFormData; onSubmit: (data: ClientFormData) => void; isPending: boolean }) {
  const [form, setForm] = useState<ClientFormData>(initial);

  const update = (field: keyof ClientFormData, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Client Name *</Label>
        <Input id="name" value={form.name} onChange={e => update("name", e.target.value)} placeholder="e.g., Acme Corp" data-testid="input-client-name" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="gscUrl" className="flex items-center gap-1.5"><Globe className="w-3 h-3" /> GSC Site URL</Label>
          <Input id="gscUrl" value={form.gscSiteUrl} onChange={e => update("gscSiteUrl", e.target.value)} placeholder="https://example.com" data-testid="input-gsc-url" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ga4" className="flex items-center gap-1.5"><BarChart3 className="w-3 h-3" /> GA4 Property ID</Label>
          <Input id="ga4" value={form.ga4PropertyId} onChange={e => update("ga4PropertyId", e.target.value)} placeholder="properties/123456" data-testid="input-ga4-id" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="callrail" className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> CallRail Company ID</Label>
          <Input id="callrail" value={form.callrailCompanyId} onChange={e => update("callrailCompanyId", e.target.value)} placeholder="COM-ABC123" data-testid="input-callrail-id" />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5"><Tag className="w-3 h-3" /> Brand Terms</Label>
        <TagInput value={form.brandTerms} onChange={v => update("brandTerms", v)} placeholder="Type a brand term and press Enter" />
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5"><Target className="w-3 h-3" /> Lead Events</Label>
        <TagInput value={form.leadEvents} onChange={v => update("leadEvents", v)} placeholder="e.g., form_submit, call_click" />
      </div>
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5"><FileText className="w-3 h-3" /> Money Pages</Label>
        <TagInput value={form.moneyPages} onChange={v => update("moneyPages", v)} placeholder="e.g., /pricing, /services/seo" />
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(form)} disabled={!form.name.trim() || isPending} data-testid="button-save-client">
          {isPending ? "Saving..." : "Save Client"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function ClientCard({ client, onEdit }: { client: Client; onEdit: () => void }) {
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/clients/${client.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Client deleted" });
    },
  });

  const integrations = [
    { label: "GSC", connected: !!client.gscSiteUrl, icon: Globe },
    { label: "GA4", connected: !!client.ga4PropertyId, icon: BarChart3 },
    { label: "CallRail", connected: !!client.callrailCompanyId, icon: Phone },
  ];

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-md bg-accent">
            <Building2 className="w-5 h-5 text-accent-foreground" />
          </div>
          <div>
            <h3 className="font-medium text-sm" data-testid={`text-client-name-${client.id}`}>{client.name}</h3>
            <p className="text-xs text-muted-foreground">
              {client.gscSiteUrl || "No site URL configured"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={onEdit} data-testid={`button-edit-client-${client.id}`}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" data-testid={`button-delete-client-${client.id}`}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {client.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove this client and all associated data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()} data-testid="button-confirm-delete">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {integrations.map((int) => (
          <Badge key={int.label} variant={int.connected ? "default" : "secondary"} className="text-[10px]">
            <int.icon className="w-3 h-3 mr-1" />
            {int.label}
          </Badge>
        ))}
      </div>

      {(client.brandTerms && client.brandTerms.length > 0) && (
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-muted-foreground mr-1">Brand:</span>
          {client.brandTerms.slice(0, 3).map((term, idx) => (
            <Badge key={idx} variant="secondary" className="text-[10px]">{term}</Badge>
          ))}
          {client.brandTerms.length > 3 && (
            <span className="text-[10px] text-muted-foreground">+{client.brandTerms.length - 3} more</span>
          )}
        </div>
      )}
    </Card>
  );
}

export default function ClientsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const { toast } = useToast();

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const createMutation = useMutation({
    mutationFn: (data: ClientFormData) => apiRequest("POST", "/api/clients", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setDialogOpen(false);
      toast({ title: "Client created successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: ClientFormData) =>
      apiRequest("PATCH", `/api/clients/${editingClient!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setEditingClient(null);
      toast({ title: "Client updated successfully" });
    },
  });

  const handleEdit = (client: Client) => {
    setEditingClient(client);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-clients-title">Clients</h1>
          <p className="text-sm text-muted-foreground">Manage your client accounts and data source configurations.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-client">
              <Plus className="w-4 h-4 mr-1.5" />
              Add Client
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
              <DialogDescription>Configure a new client with their data source connections.</DialogDescription>
            </DialogHeader>
            <ClientForm
              initial={emptyForm}
              onSubmit={(data) => createMutation.mutate(data)}
              isPending={createMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="p-4">
              <div className="space-y-3">
                <Skeleton className="h-10 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-14" />
                  <Skeleton className="h-5 w-14" />
                  <Skeleton className="h-5 w-16" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Building2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium mb-1">No clients yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Add your first client to start querying their data.</p>
          <Button onClick={() => setDialogOpen(true)} data-testid="button-add-first-client">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Client
          </Button>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} onEdit={() => handleEdit(client)} />
          ))}
        </motion.div>
      )}

      <Dialog open={!!editingClient} onOpenChange={(open) => !open && setEditingClient(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
            <DialogDescription>Update the client configuration.</DialogDescription>
          </DialogHeader>
          {editingClient && (
            <ClientForm
              initial={{
                name: editingClient.name,
                gscSiteUrl: editingClient.gscSiteUrl || "",
                ga4PropertyId: editingClient.ga4PropertyId || "",
                callrailCompanyId: editingClient.callrailCompanyId || "",
                brandTerms: editingClient.brandTerms || [],
                leadEvents: editingClient.leadEvents || [],
                moneyPages: editingClient.moneyPages || [],
                callrailOrganicSourceTerms: editingClient.callrailOrganicSourceTerms || ["google / organic"],
              }}
              onSubmit={(data) => updateMutation.mutate(data)}
              isPending={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
