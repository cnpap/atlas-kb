import type { MastraModelConfig } from "@mastra/core/llm";
import { getRuntimeModel, hasRuntimeModelApiKey } from "../knowledge/config";

export function hasRuntimeModelConfig(): boolean {
  return hasRuntimeModelApiKey();
}

export function createRuntimeModel(): MastraModelConfig {
  // OpenAI 场景统一读取 OPENAI_BASE_URL / OPENAI_API_KEY / OPENAI_MODEL；
  // 非 OpenAI 场景读取 RUNTIME_PROVIDER + RUNTIME_MODEL。
  return getRuntimeModel();
}
