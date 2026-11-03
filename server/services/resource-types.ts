export type ResourceType =
  | "article"
  | "book"
  | "course"
  | "dataset"
  | "documentation"
  | "paper"
  | "practice"
  | "project"
  | "tutorial"
  | "video";

export type LiveWebResource = {
  title: string;
  type: ResourceType;
  url: string;
  description: string;
  provider: string;
};

export type ResourceSearchContext = {
  userQuery?: string;
  goalTitle?: string;
  goalDescription?: string | null;
  goalCategory?: string | null;
  skillLevel?: string | null;
  successCriteria?: string | null;
  constraints?: string | null;
  learningStyle?: string | null;
  budgetPreference?: string | null;
  taskTitle?: string;
  taskDescription?: string | null;
  requiredSkill?: string | null;
  completionCriteria?: string | null;
};

export type ProviderResult = {
  provider: string;
  results: LiveWebResource[];
};

export type AdditionalProviderResults = {
  attemptedProviders: string[];
  successful: ProviderResult[];
  unavailableProviders: string[];
};
