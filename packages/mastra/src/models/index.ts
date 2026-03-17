import {
  getOpenAIBaseUrl,
  getOpenAIApiKey,
  getOpenAIModel,
} from "../knowledge/config";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

export function hasRuntimeModelConfig(): boolean {
  return Boolean(getOpenAIApiKey());
}

export function createRuntimeModel():
  | string
  | {
      apiKey?: string;
      id: `${string}/${string}`;
      url: string;
    } {
  const model = getOpenAIModel();
  const modelId = (
    model.includes("/") ? model : `openai/${model}`
  ) as `${string}/${string}`;
  const baseUrl = getOpenAIBaseUrl();

  if (baseUrl !== DEFAULT_OPENAI_BASE_URL) {
    return {
      apiKey: getOpenAIApiKey(),
      id: modelId,
      url: baseUrl,
    };
  }

  return modelId;
}
