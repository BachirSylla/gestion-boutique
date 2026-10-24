import { cleanupFixtures, createFixture } from "./fixtures";

export default async function globalSetup() {
  await cleanupFixtures(); // restes d'une exécution interrompue
  await createFixture();
}
