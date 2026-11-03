import { z } from "zod";
import type { AdditionalProviderResults, LiveWebResource, ProviderResult, ResourceSearchContext } from "./resource-types";

const STOP_WORDS = new Set([
  "a", "an", "and", "any", "about", "at", "by", "for", "from", "how", "in", "into", "is", "it", "learn", "learning", "me", "of", "on", "or", "please", "practice", "resource", "resources", "search", "the", "to", "tutorial", "tutorials", "video", "videos", "with", "course", "courses", "article", "articles", "book", "books", "paper", "papers", "free", "find", "goal", "my", "me", "their", "this", "that", "beginner", "advanced", "guide", "guides", "material", "materials",
  "के", "की", "का", "को", "से", "में", "पर", "और", "या", "लिए", "मेरे", "मेरा", "मेरी", "है", "हैं", "एक", "कोई", "किसी", "सभी", "कुछ", "संसाधन", "खोज", "ढूंढो", "खोजो", "वीडियो", "किताब", "किताबें", "कोर्स", "पाठ्यक्रम",
]);

const cleanText = (value: string, max: number) => value.replace(/\u0000/g, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const safeHttpsUrl = (value: unknown) => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href.slice(0, 2048) : null;
  } catch { return null; }
};
const valueText = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number") return cleanText(String(value), 300);
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(", ").slice(0, 500);
  return "";
};
const topicTokens = (value: string, max = 7) => {
  const tokens = value.normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  return [...new Set(tokens.filter(token => !STOP_WORDS.has(token) && !/^\d+$/.test(token)))].slice(0, max);
};
const topicQuery = (query: string, context: ResourceSearchContext) => {
  const parts = [context.userQuery, context.taskTitle, context.requiredSkill, context.goalTitle, query].filter(Boolean);
  const terms = topicTokens(parts.join(" "), 8);
  return terms.join(" ");
};
const label = (provider: string, detail: string) => `Source: ${provider} · ${cleanText(detail, 1_050)}`;

async function fetchJson(url: URL, provider: string, headers: Record<string, string> = {}, timeoutMs = 8_000): Promise<unknown> {
  let response: Response;
  try { response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "AURA-X/1.0 (goal-focused learning resource discovery)", ...headers }, signal: AbortSignal.timeout(timeoutMs) }); }
  catch { throw new Error(`${provider} could not connect or timed out.`); }
  if (!response.ok) throw new Error(`${provider} is temporarily unavailable (HTTP ${response.status}).`);
  try { return await response.json(); } catch { throw new Error(`${provider} returned an unreadable response.`); }
}

const archiveSearchSchema = z.object({ response: z.object({ docs: z.array(z.object({ identifier: z.string().min(1).max(240), title: z.string().min(1).max(1000) }).passthrough()).default([]) }).passthrough() }).passthrough();
const archiveMetadataSchema = z.object({ files: z.array(z.object({ name: z.string().optional().nullable(), format: z.string().optional().nullable() }).passthrough()).default([]) }).passthrough();

async function searchInternetArchive(query: string, mediaType: "movies" | "texts"): Promise<ProviderResult> {
  const words = topicTokens(query, 6);
  if (!words.length) return { provider: `Internet Archive ${mediaType}`, results: [] };
  const clauses = words.map(word => `(title:${word} OR description:${word} OR subject:${word})`).join(" AND ");
  const endpoint = new URL("https://archive.org/advancedsearch.php");
  endpoint.searchParams.set("q", `mediatype:${mediaType} AND ${clauses}`);
  for (const field of ["identifier", "title", "description", "creator", "year", "licenseurl"]) endpoint.searchParams.append("fl[]", field);
  endpoint.searchParams.set("rows", "4");
  endpoint.searchParams.set("page", "1");
  endpoint.searchParams.set("output", "json");
  const parsed = archiveSearchSchema.safeParse(await fetchJson(endpoint, `Internet Archive ${mediaType}`));
  if (!parsed.success) throw new Error(`Internet Archive ${mediaType} returned an unexpected format.`);
  const docs = parsed.data.response.docs.filter(item => /^[A-Za-z0-9_.-]{2,240}$/.test(item.identifier));

  if (mediaType === "movies") {
    const checked = await Promise.allSettled(docs.slice(0, 3).map(async item => {
      const metadataUrl = new URL(`https://archive.org/metadata/${encodeURIComponent(item.identifier)}`);
      const payload = archiveMetadataSchema.safeParse(await fetchJson(metadataUrl, "Internet Archive item metadata", {}, 6_000));
      if (!payload.success) return null;
      const playable = payload.data.files.find(file => /\b(?:mpeg.?4|mpeg.?2|matroska|quicktime|ogg video|webm|mp4|video)\b/i.test(`${file.format ?? ""} ${file.name ?? ""}`) || /\.(?:mp4|m4v|mov|mkv|webm|ogv)$/i.test(file.name ?? ""));
      if (!playable) return null;
      const url = safeHttpsUrl(`https://archive.org/details/${encodeURIComponent(item.identifier)}`);
      if (!url) return null;
      return { title: cleanText(item.title, 180), type: "video" as const, url, provider: "Internet Archive", description: label("Internet Archive", `Playable video file listed (${playable.format || "video format"}); creator: ${valueText(item.creator) || "not listed"}; year: ${valueText(item.year) || "not listed"}; rights/access: ${valueText(item.licenseurl) || "check item-level terms"}.`) };
    }));
    const results = checked.flatMap(item => item.status === "fulfilled" && item.value ? [item.value] : []);
    return { provider: "Internet Archive videos", results };
  }

  const results: LiveWebResource[] = [];
  for (const item of docs) {
    const url = safeHttpsUrl(`https://archive.org/details/${encodeURIComponent(item.identifier)}`);
    if (!url) continue;
    results.push({ title: cleanText(item.title, 180), type: "book", url, provider: "Internet Archive", description: label("Internet Archive", `Digitized text/catalog record; creator: ${valueText(item.creator) || "not listed"}; year: ${valueText(item.year) || "not listed"}; access and item-level rights vary${valueText(item.licenseurl) ? ` (rights field: ${valueText(item.licenseurl)})` : "; check item terms"}.`) });
  }
  return { provider: "Internet Archive books", results };
}

const locPayloadSchema = z.object({ results: z.array(z.object({ id: z.string().min(1).max(2048), title: z.string().min(1).max(1000) }).passthrough()).default([]) }).passthrough();
async function searchLibraryOfCongress(query: string): Promise<ProviderResult> {
  const endpoint = new URL("https://www.loc.gov/books/");
  endpoint.searchParams.set("q", cleanText(query, 300));
  endpoint.searchParams.set("fo", "json");
  endpoint.searchParams.set("c", "5");
  const parsed = locPayloadSchema.safeParse(await fetchJson(endpoint, "Library of Congress"));
  if (!parsed.success) throw new Error("Library of Congress returned an unexpected format.");
  const results: LiveWebResource[] = [];
  for (const item of parsed.data.results) {
    const url = safeHttpsUrl(item.id);
    if (!url || !url.includes("loc.gov/")) continue;
    const details = [valueText(item.date) ? `Date: ${valueText(item.date)}` : "Date: not listed", valueText(item.contributor) ? `Contributor: ${valueText(item.contributor)}` : "Contributor: not listed", valueText(item.subject) ? `Subjects: ${valueText(item.subject)}` : "Subjects: not listed", valueText(item.rights) ? `Rights: ${valueText(item.rights)}` : "Item-level rights need checking"];
    results.push({ title: cleanText(item.title, 180), type: "book", url, provider: "Library of Congress", description: label("Library of Congress", details.join(" · ")) });
  }
  return { provider: "Library of Congress", results };
}

const openAlexSchema = z.object({ results: z.array(z.object({ id: z.string().url().optional(), doi: z.string().url().nullable().optional(), display_name: z.string().optional(), publication_year: z.number().int().nullable().optional(), type: z.string().nullable().optional(), authorships: z.array(z.object({ author: z.object({ display_name: z.string().optional() }).passthrough().optional() }).passthrough()).optional(), open_access: z.object({ is_oa: z.boolean().optional(), oa_url: z.string().url().nullable().optional() }).passthrough().optional() }).passthrough()).default([]) }).passthrough();
async function searchOpenAlex(query: string): Promise<ProviderResult> {
  const endpoint = new URL("https://api.openalex.org/works");
  endpoint.searchParams.set("search", cleanText(query, 280));
  endpoint.searchParams.set("per_page", "6");
  endpoint.searchParams.set("select", "id,doi,display_name,publication_year,type,authorships,open_access");
  const parsed = openAlexSchema.safeParse(await fetchJson(endpoint, "OpenAlex"));
  if (!parsed.success) throw new Error("OpenAlex returned an unexpected format.");
  const results: LiveWebResource[] = [];
  for (const item of parsed.data.results) {
    const url = safeHttpsUrl(item.doi || item.id);
    const title = cleanText(item.display_name ?? "", 180);
    if (!url || !title) continue;
    const authors = (item.authorships ?? []).map(row => row.author?.display_name ?? "").filter(Boolean).slice(0, 3);
    const details = [`Work type: ${valueText(item.type) || "not listed"}`, `Year: ${item.publication_year ?? "not listed"}`, authors.length ? `Authors: ${authors.join(", ")}` : "Authors: not listed", item.open_access?.is_oa === true ? "OpenAlex reports an open-access location; verify destination and license" : "Open full-text access not confirmed"];
    results.push({ title, type: "paper", url, provider: "OpenAlex", description: label("OpenAlex", details.join(" · ")) });
  }
  return { provider: "OpenAlex", results };
}

const githubSchema = z.object({ items: z.array(z.object({ full_name: z.string().min(1).max(300), html_url: z.string().url(), description: z.string().nullable().optional(), stargazers_count: z.number().int().nonnegative().optional(), pushed_at: z.string().nullable().optional(), archived: z.boolean().optional(), license: z.object({ name: z.string().optional(), spdx_id: z.string().optional() }).nullable().optional() }).passthrough()).default([]) }).passthrough();
async function searchGitHub(query: string): Promise<ProviderResult> {
  const endpoint = new URL("https://api.github.com/search/repositories");
  endpoint.searchParams.set("q", `${cleanText(query, 200)} in:readme`);
  endpoint.searchParams.set("sort", "stars");
  endpoint.searchParams.set("order", "desc");
  endpoint.searchParams.set("per_page", "5");
  const parsed = githubSchema.safeParse(await fetchJson(endpoint, "GitHub repository search", { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }));
  if (!parsed.success) throw new Error("GitHub repository search returned an unexpected format.");
  const results: LiveWebResource[] = [];
  for (const item of parsed.data.items) {
    const url = safeHttpsUrl(item.html_url);
    if (!url || new URL(url).hostname !== "github.com" || item.archived || !item.full_name) continue;
    const details = [item.description ? cleanText(item.description, 500) : "Repository description not supplied", `Stars: ${item.stargazers_count ?? "not listed"}`, item.pushed_at ? `Updated: ${item.pushed_at.slice(0, 10)}` : "Update date not listed", `License: ${item.license?.spdx_id || item.license?.name || "not listed; check repository terms"}`];
    results.push({ title: cleanText(item.full_name, 180), type: "project", url, provider: "GitHub", description: label("GitHub repository", details.join(" · ")) });
  }
  return { provider: "GitHub repositories", results };
}

const europePmcSchema = z.object({ resultList: z.object({ result: z.array(z.object({ id: z.union([z.string(), z.number()]), title: z.string().optional(), authorString: z.string().optional(), journalTitle: z.string().optional(), pubYear: z.string().optional(), doi: z.string().optional(), isOpenAccess: z.string().optional(), pmcid: z.string().optional(), source: z.string().optional() }).passthrough()).default([]) }).optional() }).passthrough();
async function searchEuropePmc(query: string): Promise<ProviderResult> {
  const endpoint = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
  endpoint.searchParams.set("query", cleanText(query, 260));
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("resultType", "lite");
  endpoint.searchParams.set("pageSize", "5");
  const parsed = europePmcSchema.safeParse(await fetchJson(endpoint, "Europe PMC"));
  if (!parsed.success) throw new Error("Europe PMC returned an unexpected format.");
  const results: LiveWebResource[] = [];
  for (const item of parsed.data.resultList?.result ?? []) {
    const doi = item.doi ? safeHttpsUrl(`https://doi.org/${item.doi.replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")}`) : null;
    const url = doi ?? safeHttpsUrl(`https://europepmc.org/article/MED/${encodeURIComponent(String(item.id))}`);
    const title = cleanText(item.title ?? "", 180);
    if (!url || !title) continue;
    const details = [item.authorString ? `Authors: ${cleanText(item.authorString, 250)}` : "Authors: not listed", item.journalTitle ? `Journal: ${cleanText(item.journalTitle, 180)}` : "Journal: not listed", item.pubYear ? `Year: ${item.pubYear}` : "Year: not listed", item.isOpenAccess === "Y" ? "Europe PMC marks open access; verify the linked license" : "Open full-text access not confirmed", `Record: ${String(item.source ?? "Europe PMC")}:${String(item.id)}`];
    results.push({ title, type: "paper", url, provider: "Europe PMC", description: label("Europe PMC", details.join(" · ")) });
  }
  return { provider: "Europe PMC", results };
}

let arxivLastRequestAt = 0;
let arxivQueue: Promise<unknown> = Promise.resolve();
function serialArxivRequest<T>(request: () => Promise<T>): Promise<T> {
  const current = arxivQueue.then(async () => {
    const delay = Math.max(0, 3_000 - (Date.now() - arxivLastRequestAt));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    arxivLastRequestAt = Date.now();
    return request();
  });
  arxivQueue = current.then(() => undefined, () => undefined);
  return current;
}
function decodeXml(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code))).replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}
function atomTag(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? cleanText(decodeXml(match[1]!), 1_200) : "";
}
async function searchArxiv(query: string): Promise<ProviderResult> {
  return serialArxivRequest(async () => {
    const endpoint = new URL("https://export.arxiv.org/api/query");
    endpoint.searchParams.set("search_query", `all:${cleanText(query, 220)}`);
    endpoint.searchParams.set("start", "0");
    endpoint.searchParams.set("max_results", "5");
    endpoint.searchParams.set("sortBy", "relevance");
    let response: Response;
    try { response = await fetch(endpoint, { headers: { Accept: "application/atom+xml", "User-Agent": "AURA-X/1.0 (goal-focused learning resource discovery)" }, signal: AbortSignal.timeout(9_000) }); }
    catch { throw new Error("arXiv could not connect or timed out."); }
    if (!response.ok) throw new Error(`arXiv is temporarily unavailable (HTTP ${response.status}).`);
    const xml = await response.text();
    if (!xml.includes("<feed") || xml.length > 2_000_000) throw new Error("arXiv returned an unexpected Atom response.");
    const results: LiveWebResource[] = [];
    for (const match of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)) {
      const entry = match[1] ?? "";
      const title = atomTag(entry, "title");
      const id = safeHttpsUrl(atomTag(entry, "id"));
      const summary = atomTag(entry, "summary");
      if (!title || !id || !id.includes("arxiv.org/abs/")) continue;
      results.push({ title, type: "paper", url: id, provider: "arXiv", description: label("arXiv preprint", `${summary || "Abstract not supplied"} · This is a preprint; peer-review status is not implied.`) });
    }
    return { provider: "arXiv preprints", results };
  });
}

const stackExchangeSchema = z.object({ items: z.array(z.object({ title: z.string().min(1).max(1000), link: z.string().url(), score: z.number().int().optional(), answer_count: z.number().int().nonnegative().optional(), is_answered: z.boolean().optional(), owner: z.object({ display_name: z.string().optional() }).passthrough().optional() }).passthrough()).default([]) }).passthrough();
async function searchStackExchange(query: string): Promise<ProviderResult> {
  const endpoint = new URL("https://api.stackexchange.com/2.3/search/advanced");
  endpoint.searchParams.set("site", "stackoverflow");
  endpoint.searchParams.set("q", cleanText(query, 220));
  endpoint.searchParams.set("sort", "relevance");
  endpoint.searchParams.set("pagesize", "5");
  endpoint.searchParams.set("filter", "default");
  const parsed = stackExchangeSchema.safeParse(await fetchJson(endpoint, "Stack Exchange"));
  if (!parsed.success) throw new Error("Stack Exchange returned an unexpected format.");
  const results: LiveWebResource[] = [];
  for (const item of parsed.data.items) {
    const url = safeHttpsUrl(item.link);
    const title = cleanText(item.title, 180);
    if (!url || !title || new URL(url).hostname !== "stackoverflow.com") continue;
    const details = [`Community Q&A · ${item.answer_count ?? 0} answer(s)`, `Score: ${item.score ?? "not listed"}`, item.owner?.display_name ? `Asked by: ${cleanText(item.owner.display_name, 80)}` : "Author not listed", item.is_answered ? "An accepted answer is marked" : "No accepted answer indicated", "Linked to original; verify answers and date"];
    results.push({ title, type: "practice", url, provider: "Stack Exchange", description: label("Stack Overflow Q&A", details.join(" · ")) });
  }
  return { provider: "Stack Exchange Q&A", results };
}

const hfListSchema = z.array(z.object({ id: z.string().min(1).max(400), likes: z.number().nonnegative().optional(), downloads: z.number().nonnegative().optional(), lastModified: z.string().optional().nullable(), cardData: z.object({ license: z.string().optional().nullable() }).passthrough().optional(), sdk: z.string().optional().nullable(), stage: z.string().optional().nullable() }).passthrough());
async function searchHuggingFace(query: string): Promise<ProviderResult> {
  const results: LiveWebResource[] = [];
  for (const kind of ["datasets", "spaces"] as const) {
    const endpoint = new URL(`https://huggingface.co/api/${kind}`);
    endpoint.searchParams.set("search", cleanText(query, 200));
    endpoint.searchParams.set("limit", "4");
    endpoint.searchParams.set("sort", kind === "datasets" ? "downloads" : "likes");
    endpoint.searchParams.set("direction", "-1");
    const parsed = hfListSchema.safeParse(await fetchJson(endpoint, `Hugging Face ${kind}`));
    if (!parsed.success) throw new Error(`Hugging Face ${kind} search returned an unexpected format.`);
    for (const item of parsed.data) {
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(item.id)) continue;
      const url = safeHttpsUrl(`https://huggingface.co/${kind}/${item.id}`);
      if (!url) continue;
      const title = cleanText(item.id, 180);
      const details = [kind === "datasets" ? "Dataset card" : `Interactive Space${item.sdk ? ` · SDK: ${item.sdk}` : ""}`, item.cardData?.license ? `Declared license: ${item.cardData.license}` : "License not listed; check the card", item.lastModified ? `Updated: ${item.lastModified.slice(0, 10)}` : "Update date not listed", kind === "spaces" ? `Status metadata: ${item.stage ?? "not listed"}; availability not verified` : `Downloads: ${item.downloads ?? "not listed"}`];
      results.push({ title, type: kind === "datasets" ? "dataset" : "project", url, provider: "Hugging Face", description: label("Hugging Face Hub", details.join(" · ")) });
    }
  }
  return { provider: "Hugging Face datasets/Spaces", results };
}

function goalText(query: string, context: ResourceSearchContext) {
  return [context.userQuery, context.taskTitle, context.taskDescription, context.requiredSkill, context.goalTitle, context.goalDescription, context.goalCategory, context.successCriteria, query].filter(Boolean).join(" ").toLocaleLowerCase();
}
function hasAny(value: string, terms: string[]) { return terms.some(term => value.includes(term)); }

export async function searchAdditionalResources(query: string, context: ResourceSearchContext): Promise<AdditionalProviderResults> {
  const topic = topicQuery(query, context);
  const text = goalText(query, context);
  const searches: { provider: string; run: () => Promise<ProviderResult> }[] = [
    { provider: "Internet Archive books", run: () => searchInternetArchive(topic, "texts") },
    { provider: "Internet Archive videos", run: () => searchInternetArchive(topic, "movies") },
    { provider: "Library of Congress", run: () => searchLibraryOfCongress(topic) },
    { provider: "OpenAlex", run: () => searchOpenAlex(topic) },
  ];
  const technical = hasAny(text, ["program", "code", "software", "developer", "engineering", "computer", "python", "javascript", "typescript", "github", "data science", "math", "mathematics", "statistics", "electronics", "robot", "web app", "coding", "programming", "programar", "programación", "गणित", "कोड", "प्रोग्राम"]);
  const biomedical = hasAny(text, ["health", "medical", "medicine", "biology", "biomedical", "clinical", "nutrition", "fitness", "public health", "healthcare", "biology", "स्वास्थ्य", "चिकित्सा", "जीव विज्ञान"]);
  const stemResearch = technical || hasAny(text, ["physics", "chemistry", "astronomy", "machine learning", "artificial intelligence", "deep learning", "mathematics", "statistics", "climate science", "भौतिक", "रसायन", "गणित"]);
  const aiData = hasAny(text, ["machine learning", "artificial intelligence", "ai", "data science", "dataset", "deep learning", "neural network", "llm", "hugging face", "मशीन लर्निंग", "एआई"]);
  if (technical) {
    searches.push({ provider: "GitHub repositories", run: () => searchGitHub(topic) });
    searches.push({ provider: "Stack Exchange Q&A", run: () => searchStackExchange(topic) });
  }
  if (biomedical) searches.push({ provider: "Europe PMC", run: () => searchEuropePmc(topic) });
  if (stemResearch) searches.push({ provider: "arXiv preprints", run: () => searchArxiv(topic) });
  if (aiData) searches.push({ provider: "Hugging Face datasets/Spaces", run: () => searchHuggingFace(topic) });

  const outcomes = await Promise.allSettled(searches.map(search => search.run()));
  const successful: ProviderResult[] = [];
  const unavailableProviders: string[] = [];
  outcomes.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") successful.push(outcome.value);
    else {
      unavailableProviders.push(searches[index]!.provider);
      console.warn(`[AURA-X] ${searches[index]!.provider} resource search failed; other providers will continue.`);
    }
  });
  return { attemptedProviders: searches.map(search => search.provider), successful, unavailableProviders };
}
