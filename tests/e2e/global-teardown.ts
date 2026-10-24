import { cleanupFixtures } from "./fixtures";

export default async function globalTeardown() {
  await cleanupFixtures();
}
