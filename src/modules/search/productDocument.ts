import crypto from "crypto";

export interface ProductDocumentInput {
  name: string;
  description: string;
  category: string;
  unit: string;
}

const UNIT_LABEL: Record<string, string> = {
  kilogramo: "kilogramo",
  unidad: "unidad",
  frasco: "frasco",
  litro: "litro",
};

/** "Tomate. Tomate fresco de valle. Categoría: verduras. Se vende por kilogramo." */
export function buildProductDocument({ name, description, category, unit }: ProductDocumentInput): string {
  const clean = (s: string) => s.trim().replace(/\s+/g, " ").replace(/[.\s]+$/, "");
  return `${clean(name)}. ${clean(description)}. Categoría: ${category}. Se vende por ${UNIT_LABEL[unit] ?? unit}.`;
}

export const contentHash = (text: string) => crypto.createHash("sha256").update(text).digest("hex");
