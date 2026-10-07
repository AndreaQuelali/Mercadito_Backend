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
  acceptsCash?: boolean;
  acceptsQr?: boolean;
  paymentQrUrl?: string | null;
  paymentInstructions?: string | null;
}

export interface IUpdateSellerStatusDto {
  status: "active" | "suspended";
}
