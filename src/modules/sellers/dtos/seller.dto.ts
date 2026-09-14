export interface ICreateSellerDto {
  businessName: string;
  description?: string;
  avatarUrl?: string;
  location?: string;
}

export interface IUpdateSellerDto {
  businessName?: string;
  description?: string | null;
  avatarUrl?: string | null;
  location?: string | null;
}

export interface IUpdateSellerStatusDto {
  status: "active" | "suspended";
}
