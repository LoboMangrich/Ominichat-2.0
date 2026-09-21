import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import { UNUSABLE_PASSWORD_HASH } from './_core/passwordHash';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// Partial: a maioria das chamadas só quer atualizar alguns campos de um
// usuário que já existe (ex.: sdk.ts tocando lastSignedIn a cada request).
// InsertUser exige passwordHash (NOT NULL sem default) porque é obrigatório
// numa criação de verdade — mas essas chamadas nunca criam ninguém de fato,
// então não faz sentido exigir a senha delas. O branch de INSERT abaixo cai
// para UNUSABLE_PASSWORD_HASH quando o chamador não informa (ex.:
// scripts/create-admin.ts sempre informa; scripts/dev-session.ts nunca).
type UpsertUserInput = Partial<InsertUser> & Pick<InsertUser, "openId">;

export async function upsertUser(user: UpsertUserInput): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
      passwordHash: user.passwordHash ?? UNUSABLE_PASSWORD_HASH,
    };
    const updateSet: Record<string, unknown> = {};

    if (user.passwordHash !== undefined) {
      updateSet.passwordHash = user.passwordHash;
    }
    if (user.mustChangePassword !== undefined) {
      values.mustChangePassword = user.mustChangePassword;
      updateSet.mustChangePassword = user.mustChangePassword;
    }

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'Admin';
      updateSet.role = 'Admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    // isActive/approvedAt/approvedBy: mesmo padrão do role acima — só entram
    // em values/updateSet quando o chamador passa explicitamente. Hoje só
    // usersRouter.create (approvedAt/approvedBy na criação) e
    // scripts/create-admin.ts (bootstrap do primeiro Admin) tocam nesses
    // campos — login (passwordAuth.ts) nunca os grava.
    if (user.isActive !== undefined) {
      values.isActive = user.isActive;
      updateSet.isActive = user.isActive;
    }
    if (user.approvedAt !== undefined) {
      values.approvedAt = user.approvedAt;
      updateSet.approvedAt = user.approvedAt;
    }
    if (user.approvedBy !== undefined) {
      values.approvedBy = user.approvedBy;
      updateSet.approvedBy = user.approvedBy;
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.
