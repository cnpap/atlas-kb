# 深度知识问答 Memory 优化说明

## 做了哪些优化

1. 收紧了知识问答的 Mastra Observational Memory 参数。
   - `observation.messageTokens = 10000`
   - `observation.bufferTokens = 2000`
   - `observation.bufferActivation = 0.8`
   - `observation.blockAfter = 1.15`
   - `reflection.observationTokens = 24000`
   - `reflection.bufferActivation = 0.5`
   - `reflection.blockAfter = 1.2`

2. 在知识问答专用的 Mastra Postgres memory storage 层做了消息净化。
   - 只保留 `text` part
   - 丢弃 `data-om-*`、tool trace、reasoning、workspace metadata 等非正文 part
   - 去掉 `providerMetadata`
   - 单条消息正文最长保留 `8000` 字符，超出部分统一截断

3. 增加了长对话回归测试。
   - 验证长轮次知识问答下，Mastra memory 只会落纯文本消息
   - 验证单条 memory 消息不会无限增长

## 为什么不能只调参数

只调参数只能影响 Observational Memory 什么时候开始观察、缓冲、反思，不能解决“写进 memory 的原始消息本身就太脏”这个问题。

这次问题的根因有两个：

1. 当前知识问答线程里，Mastra memory 实际会落入大量非正文消息。
   - 例如 `data-om-status`
   - 例如 tool invocation / tool result
   - 例如 workspace metadata

2. Mastra 的内部实现并不只走一条上层 `Memory.saveMessages` 路径。
   - Observational Memory 的一部分内部持久化会直接落到底层 `MemoryPG.saveMessages`
   - 这意味着即使上层参数调小，脏消息仍然会持续写入 `mastra_messages`

结果就是：

- 在 observation 还没形成有效摘要之前，线程里的未观察消息会越积越多
- 即使 OM 已启用，也可能先把上下文撑爆
- 所以用户会感知成“这个对话框聊久了就不能用了”

## 为什么这次保留的是最小必要代码

这次实现已经收敛成最小必要版本，没有保留额外的诊断逻辑。

必须保留的只有两类改动：

1. 参数优化
   - 让 OM 更早进入观察和缓冲

2. storage 层净化
   - 无论 Mastra 内部通过哪条路径写入 memory，最终落库前都会被统一裁剪

如果去掉 storage 层净化，只保留参数优化，这个问题仍然可能复发，只是触发时间更晚。
