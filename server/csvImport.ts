/**
 * CSV Import Handler
 * Handles bulk customer data import via CSV file upload.
 * Supports upsert by email with fields: name, phone, program, renewalDate,
 * npsScore, lastInteractionAt, onboardingProgress, mrr, status
 * After import, triggers health score recalculation for all updated customers.
 */
import { Express, Request, Response } from "express";
import multer from "multer";
import Papa from "papaparse";
import { customers } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { recalculateAndSave } from "./healthScoreEngine";
import { getDb } from "./db";

// Use memory storage — we parse the buffer directly, no disk writes
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Apenas arquivos CSV são aceitos"));
    }
  },
});

// ─── Field mapping ─────────────────────────────────────────────────────────────
// Maps CSV column names (case-insensitive, with aliases) to DB fields
const FIELD_ALIASES: Record<string, string> = {
  // email
  email: "email",
  "e-mail": "email",
  "e_mail": "email",
  // name
  nome: "name",
  name: "name",
  // phone
  telefone: "phone",
  celular: "phone",
  phone: "phone",
  fone: "phone",
  // program
  programa: "program",
  product: "program",
  produto: "program",
  program: "program",
  // status
  status: "status",
  situacao: "status",
  situação: "status",
  // renewalDate
  renovacao: "renewalDate",
  renovação: "renewalDate",
  renewal: "renewalDate",
  renewal_date: "renewalDate",
  renewaldate: "renewalDate",
  data_renovacao: "renewalDate",
  "data renovação": "renewalDate",
  // npsScore
  nps: "npsScore",
  npsscore: "npsScore",
  nps_score: "npsScore",
  nota_nps: "npsScore",
  // lastInteractionAt
  ultima_interacao: "lastInteractionAt",
  "última interação": "lastInteractionAt",
  last_interaction: "lastInteractionAt",
  lastinteraction: "lastInteractionAt",
  lastinteractionat: "lastInteractionAt",
  // onboardingProgress
  progresso: "onboardingProgress",
  progress: "onboardingProgress",
  onboarding_progress: "onboardingProgress",
  onboardingprogress: "onboardingProgress",
  "% concluído": "onboardingProgress",
  "% concluido": "onboardingProgress",
  // mrr
  mrr: "mrr",
  mensalidade: "mrr",
  valor_mensal: "mrr",
  // company
  empresa: "company",
  company: "company",
};

function normalizeKey(key: string): string {
  return key.toLowerCase().trim().replace(/\s+/g, "_");
}

function parseDate(val: string): Date | null {
  if (!val || val.trim() === "") return null;
  // Try ISO first
  const d = new Date(val.trim());
  if (!isNaN(d.getTime())) return d;
  // Try DD/MM/YYYY
  const parts = val.trim().split(/[\/\-\.]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    // DD/MM/YYYY
    if (a.length <= 2 && b.length <= 2 && c.length === 4) {
      const d2 = new Date(`${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`);
      if (!isNaN(d2.getTime())) return d2;
    }
  }
  return null;
}

function parseStatus(val: string): string | null {
  const v = val.toLowerCase().trim();
  if (v === "active" || v === "ativo" || v === "ativa") return "Active";
  if (v === "at risk" || v === "em risco" || v === "risco") return "At Risk";
  if (v === "churned" || v === "cancelado" || v === "cancelada" || v === "churn") return "Churned";
  if (v === "new" || v === "novo" || v === "nova") return "New";
  return null;
}

// ─── Main import handler ───────────────────────────────────────────────────────
export function registerCsvImport(app: Express) {
  // GET /api/import/template — download CSV template
  app.get("/api/import/template", (_req: Request, res: Response) => {
    const headers = [
      "email",
      "nome",
      "telefone",
      "programa",
      "status",
      "renovacao",
      "nps",
      "ultima_interacao",
      "progresso",
      "mrr",
      "empresa",
    ];
    const example = [
      "joao@example.com",
      "João Silva",
      "11999990000",
      "Programa Premium",
      "Active",
      "2025-12-31",
      "8",
      "2025-04-20",
      "65",
      "997",
      "Empresa XYZ",
    ];
    const csv = [headers.join(","), example.join(",")].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="template_clientes.csv"');
    res.send("\uFEFF" + csv); // BOM for Excel
  });

  // POST /api/import/customers-csv — process CSV upload
  app.post(
    "/api/import/customers-csv",
    upload.single("file"),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ ok: false, error: "Nenhum arquivo enviado" });
        }

        const csvText = req.file.buffer.toString("utf-8").replace(/^\uFEFF/, ""); // strip BOM

        const parsed = Papa.parse<Record<string, string>>(csvText, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h) => h.trim(),
        });

        if (parsed.errors.length > 0 && parsed.data.length === 0) {
          return res.status(400).json({ ok: false, error: "Arquivo CSV inválido", details: parsed.errors });
        }

        const db = await getDb();
        if (!db) return res.status(500).json({ ok: false, error: "Database unavailable" });

        const results = {
          total: parsed.data.length,
          created: 0,
          updated: 0,
          skipped: 0,
          errors: [] as { row: number; email: string; reason: string }[],
        };

        const updatedCustomerIds: number[] = [];

        for (let i = 0; i < parsed.data.length; i++) {
          const row = parsed.data[i];
          const rowNum = i + 2; // 1-indexed, +1 for header

          // Map columns to DB fields
          const mapped: Record<string, string> = {};
          for (const [rawKey, val] of Object.entries(row)) {
            const normalized = normalizeKey(rawKey);
            const dbField = FIELD_ALIASES[normalized];
            if (dbField && val !== undefined && val !== null) {
              mapped[dbField] = val.trim();
            }
          }

          // Email is required
          if (!mapped.email) {
            results.errors.push({ row: rowNum, email: "", reason: "Email ausente — campo obrigatório" });
            results.skipped++;
            continue;
          }

          const email = mapped.email.toLowerCase();

          // Build update object
          const updateData: Record<string, any> = {};
          if (mapped.name) updateData.name = mapped.name;
          if (mapped.phone) updateData.phone = mapped.phone;
          if (mapped.program) updateData.program = mapped.program;
          if (mapped.company) updateData.company = mapped.company;
          if (mapped.mrr) {
            const v = parseFloat(mapped.mrr.replace(",", "."));
            if (!isNaN(v)) updateData.mrr = v;
          }
          if (mapped.npsScore) {
            const v = parseFloat(mapped.npsScore.replace(",", "."));
            if (!isNaN(v) && v >= 0 && v <= 10) updateData.npsScore = v;
          }
          if (mapped.onboardingProgress) {
            const v = parseFloat(mapped.onboardingProgress.replace(",", ".").replace("%", ""));
            if (!isNaN(v) && v >= 0 && v <= 100) updateData.onboardingProgress = v;
          }
          if (mapped.status) {
            const s = parseStatus(mapped.status);
            if (s) updateData.status = s;
          }
          if (mapped.renewalDate) {
            const d = parseDate(mapped.renewalDate);
            if (d) updateData.renewalDate = d;
          }
          if (mapped.lastInteractionAt) {
            const d = parseDate(mapped.lastInteractionAt);
            if (d) updateData.lastInteractionAt = d;
          }

          try {
            // Check if customer exists by email
            const existing = await db
              .select({ id: customers.id })
              .from(customers)
              .where(eq(customers.email, email))
              .limit(1);

            if (existing.length > 0) {
              // Update existing
              await db
                .update(customers)
                .set({ ...updateData, updatedAt: new Date() })
                .where(eq(customers.email, email));
              updatedCustomerIds.push(existing[0].id);
              results.updated++;
            } else {
              // Create new customer
              if (!updateData.name) {
                results.errors.push({ row: rowNum, email, reason: "Nome ausente para novo cliente" });
                results.skipped++;
                continue;
              }
              const [inserted] = await db.insert(customers).values({
                email,
                name: updateData.name,
                phone: updateData.phone,
                program: updateData.program,
                company: updateData.company,
                mrr: updateData.mrr,
                npsScore: updateData.npsScore,
                status: (updateData.status as any) || "New",
                renewalDate: updateData.renewalDate,
                lastInteractionAt: updateData.lastInteractionAt,
              });
              updatedCustomerIds.push((inserted as any).insertId);
              results.created++;
            }
          } catch (err: any) {
            results.errors.push({ row: rowNum, email, reason: err?.message || "Erro desconhecido" });
            results.skipped++;
          }
        }

        // Recalculate health scores for all affected customers (async, non-blocking)
        if (updatedCustomerIds.length > 0) {
          setImmediate(async () => {
            const dbConn = await getDb();
            if (!dbConn) return;
            for (const id of updatedCustomerIds) {
              try {
                await recalculateAndSave(dbConn, id);
              } catch {
                // silently skip failed recalcs
              }
            }
            console.log(`[CSV Import] Recalculated health scores for ${updatedCustomerIds.length} customers`);
          });
        }

        return res.json({
          ok: true,
          results,
          message: `Importação concluída: ${results.updated} atualizados, ${results.created} criados, ${results.skipped} ignorados`,
        });
      } catch (err: any) {
        console.error("[CSV Import] Error:", err?.message);
        return res.status(500).json({ ok: false, error: err?.message || "Erro interno" });
      }
    }
  );
}
