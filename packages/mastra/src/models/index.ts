import { getOpenAIApiKey, getOpenAIModel } from "../knowledge/config";

export function hasRuntimeModelConfig(): boolean {
  return Boolean(getOpenAIApiKey());
}

export function createRuntimeModel(): string {
  return getOpenAIModel();
}
