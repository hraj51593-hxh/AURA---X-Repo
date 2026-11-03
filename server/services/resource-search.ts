import { z } from "zod";
import { ENV } from "../_core/env";
import { searchAdditionalResources } from "./resource-discovery";
import type { LiveWebResource, ProviderResult, ResourceSearchContext, ResourceType } from "./resource-types";
export type { LiveWebResource, ResourceSearchContext, ResourceType } from "./resource-types";

const cleanText = (value: string, max: number) =>
  value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, max);

const inferType = (title: string, contentType?: string | null): ResourceType => {
  if (contentType?.toLowerCase().includes("video")) return "video";
  if (/\b(course|curriculum|specialization|learning path|syllabus|mooc)\b/i.test(title)) return "course";
  if (/\b(dataset|data set|corpus)\b/i.test(title)) return "dataset";
  if (/\b(exercise|practice problem|challenge|worked example)\b/i.test(title)) return "practice";
  if (/\b(repository|starter project|sample project)\b/i.test(title)) return "project";
  if (/\b(documentation|developer docs|reference manual)\b/i.test(title)) return "documentation";
  if (/\b(tutorial|guide|lesson|how[- ]to|learn(?:ing)?)\b/i.test(title)) return "tutorial";
  return "article";
};

const apiHubConfigured = () => Boolean(ENV.forgeApiUrl.trim() && ENV.forgeApiKey);
export function isBraveSearchConfigured() {
  return Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim());
}

export function getResourceSearchStatus() {
  const providers = ["Open Library", "Library of Congress", "Internet Archive", "Crossref", "OpenAlex", "Europe PMC (biomedical goals)", "Wikipedia"];
  if (apiHubConfigured()) providers.push("YouTube videos and playlists");
  providers.push("GitHub and Stack Exchange (technical goals)", "arXiv (STEM goals)", "Hugging Face (AI/data goals)");
  if (isBraveSearchConfigured()) providers.push("Brave Search");
  return { available: true, provider: providers.join(" · ") };
}

const braveResultPayloadSchema = z.object({
  web: z.object({
    results: z.array(z.object({
      title: z.string().min(1).max(500),
      url: z.string().url().max(4096),
      description: z.string().max(8000).optional().nullable(),
      content_type: z.string().max(160).optional().nullable(),
    }).passthrough()).default([]),
  }).optional(),
}).passthrough();

const youtubePayloadSchema = z.object({
  contents: z.array(z.object({
    type: z.string().optional(),
    video: z.object({
      videoId: z.string().min(1).max(64),
      title: z.string().min(1).max(500),
      descriptionSnippet: z.string().max(8000).optional().nullable(),
    }).passthrough().optional(),
  }).passthrough()).default([]),
}).passthrough();

const youtubePlaylistPayloadSchema = z.object({
  contents: z.array(z.object({
    type: z.string().optional(),
    playlist: z.object({
      playlistId: z.string().min(1).max(128),
      title: z.string().min(1).max(500),
      descriptionSnippet: z.string().max(8000).optional().nullable(),
    }).passthrough().optional(),
  }).passthrough()).default([]),
}).passthrough();

const wikipediaPayloadSchema = z.object({
  query: z.object({
    search: z.array(z.object({
      pageid: z.number().int().positive(),
      title: z.string().min(1).max(500),
      snippet: z.string().max(8000).optional().nullable(),
    }).passthrough()).default([]),
  }).optional(),
}).passthrough();

const openLibraryPayloadSchema = z.object({
  docs: z.array(z.object({
    key: z.string().min(1).max(160),
    title: z.string().min(1).max(500),
    author_name: z.array(z.string().max(300)).optional(),
    first_publish_year: z.number().int().min(1000).max(2200).optional(),
    edition_count: z.number().int().nonnegative().optional(),
  }).passthrough()).default([]),
}).passthrough();

const crossrefPayloadSchema = z.object({
  message: z.object({
    items: z.array(z.object({
      DOI: z.string().min(1).max(300),
      title: z.array(z.string().min(1).max(1000)).optional(),
      author: z.array(z.object({
        given: z.string().max(300).optional(),
        family: z.string().max(300).optional(),
      }).passthrough()).optional(),
      "container-title": z.array(z.string().max(500)).optional(),
      "published-print": z.object({ "date-parts": z.array(z.array(z.number().int()).max(3)).optional() }).passthrough().optional(),
      "published-online": z.object({ "date-parts": z.array(z.array(z.number().int()).max(3)).optional() }).passthrough().optional(),
      created: z.object({ "date-parts": z.array(z.array(z.number().int()).max(3)).optional() }).passthrough().optional(),
      type: z.string().max(120).optional(),
    }).passthrough()).default([]),
  }).passthrough(),
}).passthrough();

function decodeSearchSnippet(value: string) {
  return cleanText(value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">"), 1200);
}

function safeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href.slice(0, 2048) : null;
  } catch {
    return null;
  }
}

function deduplicate(resources: LiveWebResource[], limit = 14) {
  const seen = new Set<string>();
  return resources.filter(resource => {
    const url = safeHttpsUrl(resource.url);
    if (!resource.title || !url || seen.has(url)) return false;
    resource.url = url;
    seen.add(url);
    return true;
  }).slice(0, limit);
}

async function readJson(response: Response, provider: string): Promise<unknown> {
  try { return await response.json(); }
  catch { throw new Error(`${provider} returned an unreadable response.`); }
}

async function searchBraveWeb(query: string): Promise<ProviderResult> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!apiKey) throw new Error("Brave Search is not configured.");
  const endpoint = new URL("https://api.search.brave.com/res/v1/web/search");
  endpoint.searchParams.set("q", cleanText(query, 600));
  endpoint.searchParams.set("count", "8");
  endpoint.searchParams.set("safesearch", "strict");
  endpoint.searchParams.set("country", "IN");
  endpoint.searchParams.set("search_lang", "en");
  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
      signal: AbortSignal.timeout(8_000),
    });
  } catch { throw new Error("Brave Search could not connect or timed out."); }
  if (!response.ok) throw new Error(`Brave Search is temporarily unavailable (HTTP ${response.status}).`);
  const parsed = braveResultPayloadSchema.safeParse(await readJson(response, "Brave Search"));
  if (!parsed.success) throw new Error("Brave Search returned an unexpected format.");
  const results: LiveWebResource[] = [];
  for (const item of parsed.data.web?.results ?? []) {
    const title = cleanText(item.title, 180);
    const url = safeHttpsUrl(item.url);
    if (!title || !url) continue;
    results.push({ title, type: inferType(title, item.content_type), url, provider: "Brave Search", description: `Source: Brave Search · ${decodeSearchSnippet(item.description ?? "Web search result.")}` });
  }
  return { provider: "Brave Search", results: deduplicate(results, 7) };
}

async function searchYoutubeViaApiHub(query: string, kind: "video" | "playlist" = "video"): Promise<ProviderResult> {
  const endpoint = `${ENV.forgeApiUrl.replace(/\/$/, "")}/webdevtoken.v1.WebDevService/CallApi`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ENV.forgeApiKey}`, "connect-protocol-version": "1" },
      body: JSON.stringify({ apiId: "Youtube/search", query: { q: cleanText(query, 600), maxResults: "6", type: kind, safeSearch: "strict" } }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch { throw new Error("YouTube Search could not connect or timed out."); }
  if (!response.ok) throw new Error(`YouTube Search is temporarily unavailable (HTTP ${response.status}).`);
  const envelope: unknown = await readJson(response, "YouTube Search");
  let payload = envelope;
  try {
    if (typeof envelope === "object" && envelope !== null && "jsonData" in envelope && typeof envelope.jsonData === "string") payload = JSON.parse(envelope.jsonData);
  } catch { throw new Error("YouTube Search returned an unreadable response."); }
  const results: LiveWebResource[] = [];
  if (kind === "video") {
    const parsed = youtubePayloadSchema.safeParse(payload);
    if (!parsed.success) throw new Error("YouTube Search returned an unexpected video format.");
    for (const item of parsed.data.contents) {
      if (item.type !== "video" || !item.video || !/^[A-Za-z0-9_-]{6,64}$/.test(item.video.videoId)) continue;
      results.push({ title: cleanText(item.video.title, 180), type: "video", url: `https://www.youtube.com/watch?v=${item.video.videoId}`, provider: "YouTube Search", description: decodeSearchSnippet(item.video.descriptionSnippet ?? "Video returned by YouTube Search.") });
    }
  } else {
    const parsed = youtubePlaylistPayloadSchema.safeParse(payload);
    if (!parsed.success) throw new Error("YouTube Search returned an unexpected playlist format.");
    for (const item of parsed.data.contents) {
      if (item.type !== "playlist" || !item.playlist || !/^[A-Za-z0-9_-]{8,128}$/.test(item.playlist.playlistId)) continue;
      results.push({ title: cleanText(item.playlist.title, 180), type: "course", url: `https://www.youtube.com/playlist?list=${item.playlist.playlistId}`, provider: "YouTube Playlists", description: `${decodeSearchSnippet(item.playlist.descriptionSnippet ?? "")} · Playlist series candidate; inspect its sequence and coverage before treating it as a course.` });
    }
  }
  return { provider: kind === "video" ? "YouTube Search" : "YouTube Playlists", results: deduplicate(results, 5) };
}

async function searchWikipedia(query: string): Promise<ProviderResult> {
  const focusedQuery = cleanText(query.replace(/\b(learning resources?|tutorial|practice|course|video|materials?)\b/gi, " "), 300);
  const endpoint = new URL("https://en.wikipedia.org/w/api.php");
  endpoint.searchParams.set("action", "query");
  endpoint.searchParams.set("list", "search");
  endpoint.searchParams.set("srsearch", focusedQuery);
  endpoint.searchParams.set("srlimit", "4");
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("origin", "*");
  let response: Response;
  try {
    response = await fetch(endpoint, { headers: { Accept: "application/json", "User-Agent": "AURA-X/1.0 (learning resource search)" }, signal: AbortSignal.timeout(8_000) });
  } catch { throw new Error("Wikipedia could not connect or timed out."); }
  if (!response.ok) throw new Error(`Wikipedia is temporarily unavailable (HTTP ${response.status}).`);
  const parsed = wikipediaPayloadSchema.safeParse(await readJson(response, "Wikipedia"));
  if (!parsed.success) throw new Error("Wikipedia returned an unexpected format.");
  const results: LiveWebResource[] = [];
  for (const item of parsed.data.query?.search ?? []) {
    const title = cleanText(item.title, 180);
    const url = safeHttpsUrl(`https://en.wikipedia.org/?curid=${item.pageid}`);
    if (title && url) results.push({ title, type: "article", url, provider: "Wikipedia", description: decodeSearchSnippet(item.snippet ?? `Wikipedia article: ${title}.`) });
  }
  return { provider: "Wikipedia", results: deduplicate(results, 4) };
}

async function searchOpenLibrary(query: string): Promise<ProviderResult> {
  const endpoint = new URL("https://openlibrary.org/search.json");
  endpoint.searchParams.set("q", cleanText(query, 500));
  endpoint.searchParams.set("fields", "key,title,author_name,first_publish_year,edition_count");
  endpoint.searchParams.set("limit", "5");
  let response: Response;
  try {
    response = await fetch(endpoint, { headers: { Accept: "application/json", "User-Agent": "AURA-X/1.0 (learning resource search)" }, signal: AbortSignal.timeout(8_000) });
  } catch { throw new Error("Open Library could not connect or timed out."); }
  if (!response.ok) throw new Error(`Open Library is temporarily unavailable (HTTP ${response.status}).`);
  const parsed = openLibraryPayloadSchema.safeParse(await readJson(response, "Open Library"));
  if (!parsed.success) throw new Error("Open Library returned an unexpected format.");
  const results: LiveWebResource[] = [];
  for (const item of parsed.data.docs) {
    if (!/^\/works\/OL\d+W$/.test(item.key)) continue;
    const title = cleanText(item.title, 180);
    const authors = (item.author_name ?? []).map(author => cleanText(author, 120)).filter(Boolean).slice(0, 4);
    const details = ["Source: Open Library", authors.length ? `Author(s): ${authors.join(", ")}` : "Author: not listed", item.first_publish_year ? `First published: ${item.first_publish_year}` : "Publication year: not listed"];
    if (item.edition_count !== undefined) details.push(`Editions listed: ${item.edition_count}`);
    const url = safeHttpsUrl(`https://openlibrary.org${item.key}`);
    if (title && url) results.push({ title, type: "book", url, provider: "Open Library", description: details.join(" · ") });
  }
  return { provider: "Open Library", results: deduplicate(results, 5) };
}

function crossrefYear(item: z.infer<typeof crossrefPayloadSchema>["message"]["items"][number]) {
  const dateParts = item["published-print"]?.["date-parts"]?.[0]
    ?? item["published-online"]?.["date-parts"]?.[0]
    ?? item.created?.["date-parts"]?.[0];
  const year = dateParts?.[0];
  return year && year >= 1000 && year <= 2200 ? year : null;
}

async function searchCrossref(query: string): Promise<ProviderResult> {
  const endpoint = new URL("https://api.crossref.org/works");
  endpoint.searchParams.set("query.bibliographic", cleanText(query, 500));
  endpoint.searchParams.set("rows", "5");
  endpoint.searchParams.set("select", "DOI,title,author,container-title,published-print,published-online,created,type");
  let response: Response;
  try {
    response = await fetch(endpoint, { headers: { Accept: "application/json", "User-Agent": "AURA-X/1.0 (learning resource search; mailto:resources@aurax.app)" }, signal: AbortSignal.timeout(8_000) });
  } catch { throw new Error("Crossref could not connect or timed out."); }
  if (!response.ok) throw new Error(`Crossref is temporarily unavailable (HTTP ${response.status}).`);
  const parsed = crossrefPayloadSchema.safeParse(await readJson(response, "Crossref"));
  if (!parsed.success) throw new Error("Crossref returned an unexpected format.");
  const results: LiveWebResource[] = [];
  for (const item of parsed.data.message.items) {
    const doi = cleanText(item.DOI, 300).replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
    if (!/^10\.\d{4,9}\/[\S]+$/i.test(doi)) continue;
    const title = cleanText(item.title?.[0] ?? "", 180);
    const authors = (item.author ?? []).map(person => cleanText([person.given, person.family].filter(Boolean).join(" "), 120)).filter(Boolean).slice(0, 4);
    const journal = cleanText(item["container-title"]?.[0] ?? "", 180);
    const year = crossrefYear(item);
    const details = ["Source: Crossref", authors.length ? `Author(s): ${authors.join(", ")}` : "Author: not listed", journal ? `Journal: ${journal}` : "Journal: not listed", year ? `Published: ${year}` : "Publication year: not listed", `DOI: ${doi}`];
    const url = safeHttpsUrl(`https://doi.org/${encodeURIComponent(doi).replace(/%2F/gi, "/")}`);
    if (title && url) results.push({ title, type: "paper", url, provider: "Crossref", description: details.join(" · ") });
  }
  return { provider: "Crossref", results: deduplicate(results, 5) };
}

const RELEVANCE_STOP_WORDS = new Set(["a", "an", "and", "any", "are", "about", "at", "by", "for", "from", "how", "in", "into", "is", "it", "learn", "learning", "me", "of", "on", "or", "please", "practice", "resource", "resources", "search", "the", "to", "tutorial", "tutorials", "video", "videos", "with", "course", "courses", "article", "articles", "book", "books", "paper", "papers", "free", "find", "goal", "my", "me", "their", "this", "that", "beginner", "advanced", "guide", "guides", "material", "materials", "create", "make", "build", "using", "use", "for", "के", "की", "का", "को", "से", "में", "पर", "और", "या", "लिए", "मेरे", "मेरा", "मेरी", "है", "हैं", "एक", "कोई", "किसी", "सभी", "कुछ", "संसाधन", "खोज", "ढूंढो", "खोजो"]);
const relevanceTokens = (value: string) => [...new Set((value.normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter(token => !RELEVANCE_STOP_WORDS.has(token) && !/^\d+$/.test(token)))];

function rankGoalResources(resources: LiveWebResource[], context: ResourceSearchContext) {
  const weightedFields: [string, number][] = [
    [context.userQuery ?? "", 6],
    [[context.taskTitle, context.requiredSkill].filter(Boolean).join(" "), 5],
    [context.goalTitle ?? "", 4],
    [[context.taskDescription, context.completionCriteria].filter(Boolean).join(" "), 2],
    [[context.goalDescription, context.successCriteria, context.goalCategory].filter(Boolean).join(" "), 1.5],
    [[context.skillLevel, context.learningStyle, context.budgetPreference, context.constraints].filter(Boolean).join(" "), 0.7],
  ];
  const weights = new Map<string, number>();
  for (const [text, weight] of weightedFields) for (const token of relevanceTokens(text)) weights.set(token, Math.max(weights.get(token) ?? 0, weight));
  const totalWeight = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
  const goalTopics = new Set([...relevanceTokens(context.goalTitle ?? ""), ...relevanceTokens(context.goalCategory ?? ""), ...relevanceTokens(context.goalDescription ?? ""), ...relevanceTokens(context.successCriteria ?? ""), ...relevanceTokens(context.taskTitle ?? ""), ...relevanceTokens(context.requiredSkill ?? "")]);
  const userQueryTopics = new Set(relevanceTokens(context.userQuery ?? ""));
  return resources.flatMap(resource => {
    const title = new Set(relevanceTokens(resource.title));
    const description = new Set(relevanceTokens(resource.description));
    const matched = [...weights].filter(([token]) => title.has(token) || description.has(token));
    const coreMatches = matched.filter(([token]) => goalTopics.has(token));
    const queryMatches = matched.filter(([token]) => userQueryTopics.has(token));
    if (goalTopics.size > 0 && !coreMatches.length) return [];
    if (userQueryTopics.size > 0 && !queryMatches.length) return [];
    if (!matched.length) return [];
    const matchedWeight = matched.reduce((sum, [token, weight]) => sum + weight * (title.has(token) ? 1 : 0.55), 0);
    const score = totalWeight ? matchedWeight / totalWeight : 0;
    if (score < 0.035) return [];
    const matchedTopics = coreMatches.slice(0, 5).map(([token]) => token);
    return [{ ...resource, score, description: `${resource.description} · Topic match: ${matchedTopics.join(", ")}`.slice(0, 1_800) }];
  }).sort((left, right) => right.score - left.score);
}

export async function searchLearningResources(query: string, context: ResourceSearchContext = {}) {
  const normalizedQuery = cleanText([query, context.goalTitle, context.goalCategory, context.skillLevel, context.taskTitle, context.requiredSkill].filter(Boolean).join(" "), 600);
  if (normalizedQuery.length < 3) throw new Error("Enter a more specific search topic.");

  const searches: { provider: string; run: () => Promise<ProviderResult> }[] = [
    { provider: "Open Library", run: () => searchOpenLibrary(normalizedQuery) },
    { provider: "Crossref", run: () => searchCrossref(normalizedQuery) },
    { provider: "Wikipedia", run: () => searchWikipedia(normalizedQuery) },
  ];
  if (apiHubConfigured()) {
    searches.push({ provider: "YouTube Search", run: () => searchYoutubeViaApiHub(normalizedQuery, "video") });
    searches.push({ provider: "YouTube Playlists", run: () => searchYoutubeViaApiHub(normalizedQuery, "playlist") });
  }
  if (isBraveSearchConfigured()) searches.push({ provider: "Brave Search", run: () => searchBraveWeb(normalizedQuery) });

  const [coreOutcomes, additional] = await Promise.all([
    Promise.allSettled(searches.map(search => search.run())),
    searchAdditionalResources(normalizedQuery, { ...context, userQuery: context.userQuery ?? query }),
  ]);
  const successful: ProviderResult[] = [...additional.successful];
  const unavailableProviders: string[] = [...additional.unavailableProviders];
  coreOutcomes.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") successful.push(outcome.value);
    else {
      unavailableProviders.push(searches[index]!.provider);
      console.warn(`[AURA-X] ${searches[index]!.provider} resource search failed; retaining other providers' results.`);
    }
  });
  if (!successful.length) throw new Error(`All live resource providers are currently unavailable (${unavailableProviders.join(", ")}). No links were saved; please retry.`);
  const providers = [...new Set(successful.map(result => result.provider))];
  const ranked = rankGoalResources(deduplicate(successful.flatMap(result => result.results), 100), { ...context, userQuery: context.userQuery ?? query });
  return {
    provider: providers.join(" · "),
    providers,
    unavailableProviders,
    partial: unavailableProviders.length > 0,
    foundBeforeRelevanceFilter: successful.reduce((sum, result) => sum + result.results.length, 0),
    filteredOutAsOffTopic: Math.max(0, successful.reduce((sum, result) => sum + result.results.length, 0) - ranked.length),
    results: ranked.slice(0, 40).map(({ score: _score, ...resource }) => resource),
  };
}
