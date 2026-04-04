import { PrismaClient } from "@/src/generated/prisma/client";
import { buildDatabaseUrl } from "./database-url";

const databaseUrl = buildDatabaseUrl();

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        datasourceUrl: databaseUrl,
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}
