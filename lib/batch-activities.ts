export type BatchActivityResult = {
  line: string;
  status: "added" | "duplicate" | "failed";
  dayNumber?: number;
  placeName?: string;
  message: string;
};

export type BatchActivitiesState = {
  submitted: boolean;
  summary: {
    added: number;
    duplicate: number;
    failed: number;
  };
  results: BatchActivityResult[];
  error?: string;
};

export const initialBatchActivitiesState: BatchActivitiesState = {
  submitted: false,
  summary: {
    added: 0,
    duplicate: 0,
    failed: 0
  },
  results: []
};
