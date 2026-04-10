function buildCollectionConfig() {
  return {
    params: {
      vectors: {
        size: 3,
        distance: "Cosine",
      },
    },
  };
}

export function buildMockQdrantResponse(
  url: string,
  method = "GET",
): Record<string, unknown> {
  const pathname = new URL(url).pathname;
  const normalizedMethod = method.toUpperCase();

  if (pathname === "/collections" && normalizedMethod === "GET") {
    return {
      result: {
        collections: [],
      },
      status: "ok",
    };
  }

  if (/^\/collections\/[^/]+$/.test(pathname) && normalizedMethod === "GET") {
    return {
      result: {
        config: buildCollectionConfig(),
        points_count: 0,
      },
      status: "ok",
    };
  }

  if (
    pathname.endsWith("/points/query") ||
    pathname.endsWith("/points/search")
  ) {
    return {
      result: {
        points: [],
      },
      status: "ok",
    };
  }

  if (pathname.endsWith("/points/scroll")) {
    return {
      result: {
        points: [],
        next_page_offset: null,
      },
      status: "ok",
    };
  }

  return {
    result: {
      status: "ok",
    },
    status: "ok",
  };
}
