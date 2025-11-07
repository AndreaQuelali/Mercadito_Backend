export interface ICreateReviewDto {
  productId: number;
  rating: number; // 1..5
  comment?: string;
}
