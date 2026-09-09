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
};

export type ReviewDto = {
  id: number;
  benchId: number;
  author: string;
  rating: number;
  text: string;
  createdAt: string;
};

export type BenchDetails = BenchSummary & {
  reviews: ReviewDto[];
};
