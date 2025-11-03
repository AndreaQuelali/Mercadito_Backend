export interface IProductFilter {
  name?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  startAt?: Date;
  endAt?: Date; 
}
