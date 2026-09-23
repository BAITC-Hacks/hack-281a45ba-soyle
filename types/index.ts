export const taskFieldKeys = [
  "context",
  "need",
  "users",
  "dataAndMaterials",
  "constraints",
  "expectedResult",
  "successCriteria",
  "contact",
  "interactionFormat",
] as const;

export const confirmableFieldKeys = ["title", "industry", ...taskFieldKeys] as const;

export type TaskFieldKey = (typeof taskFieldKeys)[number];
export type PublicationStatus = "DRAFT" | "PUBLISHED";
export type ProposalStatus = "PENDING" | "ACCEPTED" | "REJECTED";
export type ReadinessLevel = "REQUIRES_CLARIFICATION" | "WORKING" | "READY" | "PRIORITY";

export interface ReadinessInput {
  context?: string | null;
  need?: string | null;
  users?: string | null;
  dataAndMaterials?: string | null;
  constraints?: string | null;
  expectedResult?: string | null;
  successCriteria?: string | null;
  contact?: string | null;
  interactionFormat?: string | null;
  confirmedFields: string[];
}

export interface TaskView extends ReadinessInput {
  id: string;
  title: string;
  industry: string;
  initialDescription: string;
  publicationStatus: PublicationStatus;
  createdAt: string;
  updatedAt: string;
  proposalCount: number;
  readiness: ReadinessResult;
}

export interface ScoreItem {
  field: TaskFieldKey;
  label: string;
  earned: number;
  possible: number;
}

export interface ReadinessResult {
  score: number;
  level: ReadinessLevel;
  label: string;
  breakdown: ScoreItem[];
  missingFields: TaskFieldKey[];
  recommendations: string[];
}

export interface ProposalView {
  id: string;
  taskId: string;
  teamName: string;
  solutionIdea: string;
  plan: string;
  estimatedDuration: string;
  prototypeUrl: string | null;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
  task?: { id: string; title: string };
}

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = { success: false; error: { code: string; message: string } };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
