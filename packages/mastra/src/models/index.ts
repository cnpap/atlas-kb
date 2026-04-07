import { createOpenAI, type OpenAIProvider } from "@ai-sdk/openai";
import {
  getOpenAIBaseUrl,
  getOpenAIApiKey,
  getOpenAIModel,
} from "../knowledge/config";

export function hasRuntimeModelConfig(): boolean {
  return Boolean(getOpenAIApiKey());
}

export function createRuntimeModel(): ReturnType<OpenAIProvider> {
  const provider = createOpenAI({
    apiKey: getOpenAIApiKey(),
    baseURL: getOpenAIBaseUrl(),
    name: "openai",
  });

  return provider(getOpenAIModel() as Parameters<OpenAIProvider>[0]);
}
