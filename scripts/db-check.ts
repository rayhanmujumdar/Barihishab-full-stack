// Smoke test: write a row to connection_tests through the app's Prisma
// client, read it back, then clean up. Run with `pnpm db:check`.
import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
  const marker = `db-check ${new Date().toISOString()}`;

  const created = await prisma.connectionTest.create({
    data: { message: marker },
  });
  const found = await prisma.connectionTest.findUnique({
    where: { id: created.id },
  });

  if (found?.message !== marker) {
    throw new Error(`Read-back mismatch: expected "${marker}", got "${found?.message}"`);
  }

  const [{ version }] = await prisma.$queryRaw<{ version: string }[]>`SELECT version()`;
  await prisma.connectionTest.delete({ where: { id: created.id } });

  console.log("✔ Connected:", version.split(",")[0]);
  console.log(`✔ Wrote and read back row #${created.id} in connection_tests`);
  console.log("✔ Cleaned up test row");
}

main()
  .catch((err) => {
    console.error("✘ Database check failed:\n", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
