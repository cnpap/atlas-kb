import { getRuntimeModel, hasRuntimeModelApiKey } from "../knowledge/config";

export function hasRuntimeModelConfig(): boolean {
  return hasRuntimeModelApiKey();
}

export function createRuntimeModel(): string {
  // 运行时模型统一由单一环境变量控制，格式为 provider/model。
  // 未配置时默认回退到 openai/gpt-5.4；切换到 alibaba-cn 等 provider
  // 时，只需要改环境变量，不需要改业务代码。
  return getRuntimeModel();
}
