// Snake_case shapes as stored in Postgres. These are the raw rows returned by the
// Supabase client; the mappers in mappers.ts convert them to the camelCase
// @vitruvius/core types and validate with the core zod schemas.

export type ManualRow = {
  id: string;
  title: string;
  video_url: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type StepRow = {
  id: string;
  manual_id: string;
  order: number;
  title: string;
  instruction: string;
  start_ms: number;
  end_ms: number;
  keyframe_url: string;
  tools: string[];
  parts: string[];
  warnings: string[];
  confidence: number;
  review_status: string;
  source_notes: string[];
  alternatives: string[];
};

export type JobRow = {
  id: string;
  manual_id: string;
  type: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};
