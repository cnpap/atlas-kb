export function hasRuntimeModelConfig(): boolean {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  return Boolean(apiKey);
}

export function createRuntimeModel(): string {
  const configuredModel = process.env.OPENAI_MODEL?.trim();
  return configuredModel && configuredModel.length > 0
    ? configuredModel
    : "gpt-4.1-mini";
}
