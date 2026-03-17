import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createApp } from "./app";

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.OPENAI_API_KEY;

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("@atlas-kb/api", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    globalThis.fetch = originalFetch;
  });

  it("returns health status", async () => {
    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/api/health"),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(200);
    expect(payload.success).toBeTrue();
  });

  it("returns 404 for an unknown knowledge space", async () => {
    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/api/kb/spaces/unknown/documents"),
    );
    const payload = await readJson(response);

    expect(response.status).toBe(404);
    expect(payload.success).toBeFalse();
  });

  it("returns a mock ask response without a model key", async () => {
    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/api/kb/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: "How should onboarding start?",
        }),
      }),
    );
    const payload = await readJson(response);
    const data = payload.data as {
      mode: string;
      citations: unknown[];
    };

    expect(response.status).toBe(200);
    expect(data.mode).toBe("mock");
    expect(data.citations.length).toBeGreaterThan(0);
  });

  it("returns a model ask response when the provider call succeeds", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "https://api.openai.com/v1/chat/completions") {
        expect(init?.method).toBe("POST");
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Use short quotations and cite the source title.",
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }

      return originalFetch(input, init);
    };

    const app = createApp();
    const response = await app.handle(
      new Request("http://localhost/api/kb/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: "How should answers cite evidence?",
        }),
      }),
    );
    const payload = await readJson(response);
    const data = payload.data as {
      mode: string;
      answer: string;
    };

    expect(response.status).toBe(200);
    expect(data.mode).toBe("model");
    expect(data.answer).toContain("cite the source title");
  });
});
