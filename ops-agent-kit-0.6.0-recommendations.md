# Ops Agent Kit 0.6.0 Recommendations

This checklist captures the library-side changes that should move out of `atlas-kb` host code and into `@cnpap/ops-agent-kit`.

## Current pain points

- Standard Docling extraction still relies on a synchronous convert request, which makes large files fail fast on upstream `504 Gateway Timeout`.
- Long-running parsing can leave Atlas KB sources in `processing` without a persisted checkpoint during the early `canonicalizing` phase.
- Docling transport behavior is not configurable enough; timeout, retry, and poll settings are effectively hard-coded in the package.

## Recommended refactors

1. Use one asynchronous Docling transport for all extraction modes.
   Standard extraction should follow `submit -> poll -> fetch result`, not a direct synchronous convert call.

2. Expose formal Docling transport settings in package config.
   Add `requestTimeoutMs`, `pollIntervalMs`, `maxPolls`, `maxRetries`, `retryBaseDelayMs`, plus configurable async status/result paths.

3. Retry only transient upstream failures inside the package.
   Treat `408`, `429`, `500`, `502`, `503`, `504`, network timeout, and connection reset as retriable. Do not retry permanent `4xx` validation failures.

4. Persist a minimal checkpoint before canonicalization starts.
   Save `status = "canonicalizing"` immediately so hosts can display parsing progress instead of a generic `processing` state with no detail.

5. Refresh checkpoint heartbeat during async polling.
   Update `updatedAt` while Docling polling is still running so hosts can distinguish a healthy long job from a stuck job.

6. Keep checkpoint semantics host-neutral.
   The package should own checkpoint lifecycle and failure classification; the host should only map checkpoint state to product-facing UI and job orchestration.
