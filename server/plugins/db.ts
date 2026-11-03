import { runBoardMigrations } from "../db/migrations.js";

export default async (nitroApp: any): Promise<void> => {
  await runBoardMigrations(nitroApp);
};
