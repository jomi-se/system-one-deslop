import { APIError, noul, TypeSafeClient } from "@typesafe-ai/sdk";

try {
  const client = new TypeSafeClient({
    baseURL: "https://api.typesafe.ai",
    defaultModel: "jev-latest",
    logLevel: "off",
    retry: { maxRetries: 0 },
    timeout: 15_000,
  });
  const result = await client.systemOne({
    state: "The sky is blue.",
    questions: { mentionsColor: noul("Does the text mention a color?") },
  });
  const probability: number = result.answers.mentionsColor.noul;
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new Error("Invalid noul response");
  }
  console.log(`Smoke passed: noul=${probability}`);
} catch (error: unknown) {
  // SDK errors can contain server response bodies; report no raw error data.
  const status = error instanceof APIError ? ` (HTTP ${error.status})` : "";
  console.error(`Smoke failed${status}. Check the API key and network access.`);
  process.exitCode = 1;
}
