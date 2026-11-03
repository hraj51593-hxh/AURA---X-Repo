import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadSearch = async () => {
  vi.resetModules();
  return import("./resource-search");
};

const jsonResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

function emptyAdditionalProviderResponse(url: string): Response | null {
  if (url.startsWith("https://archive.org/advancedsearch.php")) return jsonResponse({ response: { docs: [] } });
  if (url.startsWith("https://www.loc.gov/books/")) return jsonResponse({ results: [] });
  if (url.startsWith("https://api.openalex.org/works")) return jsonResponse({ results: [] });
  if (url.startsWith("https://api.github.com/search/repositories")) return jsonResponse({ items: [] });
  if (url.startsWith("https://api.stackexchange.com/2.3/search/advanced")) return jsonResponse({ items: [] });
  if (url.startsWith("https://export.arxiv.org/api/query")) return new Response("<feed xmlns=\"http://www.w3.org/2005/Atom\"></feed>", { headers: { "content-type": "application/atom+xml" } });
  if (url.startsWith("https://huggingface.co/api/datasets") || url.startsWith("https://huggingface.co/api/spaces")) return jsonResponse([]);
  return null;
}

const youtubeResponse = (kind: string) => kind === "playlist"
  ? { contents: [{ type: "playlist", playlist: { playlistId: "PL123456789012", title: "Python full course playlist", descriptionSnippet: "A sequence of Python lessons." } }] }
  : { contents: [{ type: "video", video: { videoId: "fWjsdhR3z3c", title: "Python basics tutorial", descriptionSnippet: "A short Python tutorial." } }] };

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AURA-X live resource search", () => {
  it("returns real, topic-matched books, papers, articles, videos and playlist candidates", async () => {
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "");
    vi.stubEnv("MANUS_API_URL", "https://api.manus.ai");
    vi.stubEnv("MANUS_API_KEY", "test-project-token");

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes("openlibrary.org/search.json")) return jsonResponse({ docs: [{ key: "/works/OL12345W", title: "Python Field Guide", author_name: ["A. Developer"], first_publish_year: 2022, edition_count: 4 }] });
      if (url.includes("api.crossref.org/works")) return jsonResponse({ message: { items: [{ DOI: "10.1234/python.study", title: ["A study of Python learning"], author: [{ given: "Ari", family: "Researcher" }], "container-title": ["Journal of Learning"], "published-print": { "date-parts": [[2023, 4, 1]] }, type: "journal-article" }] } });
      if (url.includes("WebDevService/CallApi")) {
        const body = JSON.parse(String(init?.body)) as { query?: { type?: string } };
        return jsonResponse(youtubeResponse(body.query?.type ?? "video"));
      }
      if (url.startsWith("https://en.wikipedia.org/w/api.php")) return jsonResponse({ query: { search: [{ pageid: 23862, title: "Python (programming language)", snippet: "A <span class=\"searchmatch\">Python</span> article &amp; reference." }] } });
      const extra = emptyAdditionalProviderResponse(url);
      if (extra) return extra;
      throw new Error(`Unexpected provider URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getResourceSearchStatus, searchLearningResources } = await loadSearch();
    const status = getResourceSearchStatus();
    expect(status.available).toBe(true);
    expect(status.provider).toContain("Library of Congress");
    expect(status.provider).toContain("YouTube videos and playlists");

    const result = await searchLearningResources("Python programming basics tutorial practice");
    expect(result.providers).toContain("Open Library");
    expect(result.providers).toContain("YouTube Search");
    expect(result.providers).toContain("YouTube Playlists");
    expect(result.partial).toBe(false);
    expect(result.results).toHaveLength(5);
    expect(result.results).toContainEqual(expect.objectContaining({ title: "Python basics tutorial", type: "video", url: "https://www.youtube.com/watch?v=fWjsdhR3z3c" }));
    expect(result.results).toContainEqual(expect.objectContaining({ title: "Python full course playlist", type: "course", url: "https://www.youtube.com/playlist?list=PL123456789012" }));
    expect(result.results).toContainEqual(expect.objectContaining({ title: "Python (programming language)", type: "article", url: "https://en.wikipedia.org/?curid=23862", description: expect.stringContaining("Python article & reference") }));
    expect(result.results).toContainEqual(expect.objectContaining({ title: "Python Field Guide", type: "book", url: "https://openlibrary.org/works/OL12345W", description: expect.stringContaining("A. Developer") }));
    expect(result.results).toContainEqual(expect.objectContaining({ title: "A study of Python learning", type: "paper", url: "https://doi.org/10.1234/python.study", description: expect.stringContaining("Journal of Learning") }));
    const calledUrls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(calledUrls.some(url => url.startsWith("https://www.loc.gov/books/"))).toBe(true);
    expect(calledUrls.some(url => url.startsWith("https://api.openalex.org/works"))).toBe(true);
  });

  it("includes real Brave results alongside the no-key providers when configured", async () => {
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "test-brave-token");
    vi.stubEnv("MANUS_API_URL", "https://api.manus.ai");
    vi.stubEnv("MANUS_API_KEY", "test-project-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes("api.search.brave.com")) return jsonResponse({ web: { results: [{ title: "Official Python tutorial", url: "https://docs.python.org/tutorial/", description: "Official documentation", content_type: "text/html" }] } });
      if (url.includes("openlibrary.org/search.json")) return jsonResponse({ docs: [] });
      if (url.includes("api.crossref.org/works")) return jsonResponse({ message: { items: [] } });
      if (url.includes("WebDevService/CallApi")) {
        const body = JSON.parse(String(init?.body)) as { query?: { type?: string } };
        return jsonResponse({ contents: body.query?.type === "video" ? [{ type: "video", video: { videoId: "fWjsdhR3z3c", title: "Python overview", descriptionSnippet: "Python overview." } }] : [] });
      }
      if (url.startsWith("https://en.wikipedia.org/w/api.php")) return jsonResponse({ query: { search: [] } });
      const extra = emptyAdditionalProviderResponse(url);
      if (extra) return extra;
      throw new Error(`Unexpected provider URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { searchLearningResources } = await loadSearch();
    const result = await searchLearningResources("Python tutorial");
    expect(result.providers).toContain("Brave Search");
    expect(result.results.some(item => item.url === "https://docs.python.org/tutorial/")).toBe(true);
    expect(result.results.every(item => item.description.includes("Topic match:"))).toBe(true);
  });

  it("keeps keyless providers available and never fabricates results during outages", async () => {
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "");
    vi.stubEnv("MANUS_API_URL", "");
    vi.stubEnv("MANUS_API_KEY", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (): Promise<Response> => new Response("temporary outage", { status: 503 })));

    const { getResourceSearchStatus, searchLearningResources } = await loadSearch();
    const status = getResourceSearchStatus();
    expect(status.available).toBe(true);
    expect(status.provider).toContain("Open Library");
    expect(status.provider).toContain("OpenAlex");
    await expect(searchLearningResources("Python basics")).rejects.toThrow("All live resource providers are currently unavailable");
  });

  it("surfaces a provider outage when every configured live source fails", async () => {
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "");
    vi.stubEnv("MANUS_API_URL", "https://api.manus.ai");
    vi.stubEnv("MANUS_API_KEY", "test-project-token");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (): Promise<Response> => new Response("temporary outage", { status: 503 })));

    const { searchLearningResources } = await loadSearch();
    await expect(searchLearningResources("Python basics")).rejects.toThrow("All live resource providers are currently unavailable");
  });

  it("retains real results and marks partial provider outages", async () => {
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "");
    vi.stubEnv("MANUS_API_URL", "https://api.manus.ai");
    vi.stubEnv("MANUS_API_KEY", "test-project-token");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes("api.crossref.org/works")) return new Response("temporary outage", { status: 503 });
      if (url.includes("openlibrary.org/search.json")) return jsonResponse({ docs: [] });
      if (url.includes("WebDevService/CallApi")) {
        const body = JSON.parse(String(init?.body)) as { query?: { type?: string } };
        return jsonResponse(body.query?.type === "video" ? { contents: [{ type: "video", video: { videoId: "fWjsdhR3z3c", title: "Python practice", descriptionSnippet: "Practice Python basics." } }] } : { contents: [] });
      }
      if (url.startsWith("https://en.wikipedia.org/w/api.php")) return jsonResponse({ query: { search: [{ pageid: 23862, title: "Python", snippet: "Python reference." }] } });
      const extra = emptyAdditionalProviderResponse(url);
      if (extra) return extra;
      throw new Error(`Unexpected provider URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { searchLearningResources } = await loadSearch();
    const result = await searchLearningResources("Python basics");
    expect(result.partial).toBe(true);
    expect(result.unavailableProviders).toEqual(["Crossref"]);
    expect(result.results).toHaveLength(2);
    expect(result.results.some(item => item.type === "video")).toBe(true);
  });

  it("rejects off-topic hits even when they match an optional phrase", async () => {
    vi.stubEnv("BRAVE_SEARCH_API_KEY", "");
    vi.stubEnv("MANUS_API_URL", "");
    vi.stubEnv("MANUS_API_KEY", "");
    const fetchMock = vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes("openlibrary.org/search.json")) return jsonResponse({ docs: [
        { key: "/works/OL12345W", title: "Python debugging handbook", author_name: ["A. Developer"] },
        { key: "/works/OL67890W", title: "React debugging handbook", author_name: ["B. Developer"] },
      ] });
      if (url.includes("api.crossref.org/works")) return jsonResponse({ message: { items: [] } });
      if (url.startsWith("https://en.wikipedia.org/w/api.php")) return jsonResponse({ query: { search: [] } });
      const extra = emptyAdditionalProviderResponse(url);
      if (extra) return extra;
      throw new Error(`Unexpected provider URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { searchLearningResources } = await loadSearch();
    const result = await searchLearningResources("Python debugging", { userQuery: "debugging", goalTitle: "Write Python scripts", goalCategory: "software" });
    expect(result.results.some(item => item.title === "Python debugging handbook")).toBe(true);
    expect(result.results.some(item => item.title === "React debugging handbook")).toBe(false);
  });
});
