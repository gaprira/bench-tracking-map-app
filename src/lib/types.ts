export type BenchSummary = {
  id: number;
  title: string;
  description: string | null;
  lat: number;
  lng: number;
  createdBy: string;
  createdAt: string;
  reviewCount: number;
  avgRating: number | null;
  benchPhoto: string | null;
  viewPhoto: string | null;
  tags: string[];
  status?: "approved" | "pending";
  photoScore?: number | null;
};

export type ReviewDto = {
  id: number;
  benchId: number;
  author: string;
  rating: number;
  text: string;
  likes: number;
  createdAt: string;
};

export type BenchDetails = BenchSummary & {
  reviews: ReviewDto[];
};
