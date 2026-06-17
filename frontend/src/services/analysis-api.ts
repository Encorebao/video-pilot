import { apiRequest } from "@/services/api-client";
import type { AnalysisResults, AnalysisTaxonomy } from "@/types/project";

export function getProjectAnalysis(folderPath: string): Promise<AnalysisResults> {
  const params = new URLSearchParams({ folderPath });
  return apiRequest<AnalysisResults>(`/api/analysis?${params.toString()}`);
}

export function getAnalysisTaxonomy(): Promise<AnalysisTaxonomy> {
  return apiRequest<AnalysisTaxonomy>("/api/analysis/taxonomy");
}
