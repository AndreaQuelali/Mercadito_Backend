/**
 * Retrieval evaluation for the vector half of the search. Runs against the real Voyage API, in memory,
 * without a database:  VOYAGE_API_KEY=... npm run eval:search
 *
 * It embeds a small Spanish catalog and a set of queries, ranks by cosine similarity and reports
 * recall@5 and MRR for the queries that have an answer, plus the best similarity of the queries
 * that have none (e.g. "televisor"), which is what SEARCH_MIN_SIMILARITY has to stay above.
 */
import { EmbeddingsError, embedDocuments, embedQueries, embeddingModelName, embeddingsAvailable } from "../tools/embeddings.tool";
import { buildProductDocument } from "../modules/search/productDocument";

interface CatalogItem {
  name: string;
  description: string;
  category: string;
  unit: string;
}

const CATALOG: CatalogItem[] = [
  // verduras
  { name: "Tomate", description: "Tomate fresco de valle", category: "verduras", unit: "kilogramo" },
  { name: "Cebolla morada", description: "Cebolla morada de cosecha reciente", category: "verduras", unit: "kilogramo" },
  { name: "Zanahoria", description: "Zanahorias crujientes sin pesticidas", category: "verduras", unit: "kilogramo" },
  { name: "Lechuga orgánica", description: "Lechuga crespa orgánica para ensaladas", category: "verduras", unit: "unidad" },
  { name: "Papa blanca", description: "Papa blanca para freír o hervir", category: "verduras", unit: "kilogramo" },
  { name: "Pimiento rojo", description: "Pimiento rojo dulce", category: "verduras", unit: "kilogramo" },
  // frutas
  { name: "Manzana roja", description: "Manzanas rojas dulces y firmes", category: "frutas", unit: "kilogramo" },
  { name: "Plátano", description: "Plátano maduro de la costa", category: "frutas", unit: "kilogramo" },
  { name: "Naranja", description: "Naranjas jugosas para jugo", category: "frutas", unit: "kilogramo" },
  { name: "Fresas", description: "Fresas frescas de temporada", category: "frutas", unit: "kilogramo" },
  { name: "Mango", description: "Mango maduro dulce", category: "frutas", unit: "unidad" },
  { name: "Limón", description: "Limones verdes y ácidos", category: "frutas", unit: "kilogramo" },
  // panaderia
  { name: "Pan de masa madre", description: "Pan artesanal de masa madre con fermentación lenta", category: "panaderia", unit: "unidad" },
  { name: "Pan sin gluten", description: "Pan de harina de arroz y maíz, apto para celíacos", category: "panaderia", unit: "unidad" },
  { name: "Croissant", description: "Croissant de mantequilla horneado cada mañana", category: "panaderia", unit: "unidad" },
  { name: "Pan integral", description: "Pan integral con semillas de girasol", category: "panaderia", unit: "unidad" },
  { name: "Galletas de avena", description: "Galletas caseras de avena y pasas", category: "panaderia", unit: "unidad" },
  { name: "Torta de chocolate", description: "Torta húmeda de chocolate para cumpleaños", category: "panaderia", unit: "unidad" },
  // lacteos
  { name: "Leche entera", description: "Leche fresca de vaca entera", category: "lacteos", unit: "litro" },
  { name: "Queso fresco", description: "Queso fresco artesanal de vaca", category: "lacteos", unit: "kilogramo" },
  { name: "Yogur natural", description: "Yogur natural sin azúcar", category: "lacteos", unit: "frasco" },
  { name: "Mantequilla", description: "Mantequilla artesanal sin sal", category: "lacteos", unit: "unidad" },
  { name: "Queso mozzarella", description: "Mozzarella para pizza y gratinados", category: "lacteos", unit: "kilogramo" },
  { name: "Leche de cabra", description: "Leche de cabra fresca, ideal para intolerantes a la lactosa", category: "lacteos", unit: "litro" },
  // artesanias
  { name: "Canasta de mimbre", description: "Canasta tejida a mano en mimbre", category: "artesanias", unit: "unidad" },
  { name: "Vela de soya", description: "Vela aromática de soya con aroma a lavanda", category: "artesanias", unit: "unidad" },
  { name: "Jabón artesanal", description: "Jabón de glicerina con avena y miel", category: "artesanias", unit: "unidad" },
  { name: "Mermelada casera de mora", description: "Mermelada casera de mora en frasco de vidrio", category: "artesanias", unit: "frasco" },
  { name: "Bufanda de lana", description: "Bufanda tejida de lana de alpaca", category: "artesanias", unit: "unidad" },
  { name: "Tazas de cerámica", description: "Tazas de cerámica pintadas a mano", category: "artesanias", unit: "unidad" },
];

interface EvalQuery {
  q: string;
  /** Names of the catalog items that answer the query; empty = nothing in the catalog should match */
  expected: string[];
  note?: string;
}

const QUERIES: EvalQuery[] = [
  { q: "pan sin gluten", expected: ["Pan sin gluten"] },
  { q: "pan para celíacos", expected: ["Pan sin gluten"], note: "sinónimo" },
  { q: "tomates", expected: ["Tomate"], note: "plural" },
  { q: "verdura para ensalada", expected: ["Lechuga orgánica", "Tomate", "Zanahoria"] },
  { q: "algo dulce para el postre", expected: ["Torta de chocolate", "Galletas de avena", "Fresas", "Mango"] },
  { q: "fruta para hacer jugo", expected: ["Naranja", "Limón"] },
  { q: "leche sin lactosa", expected: ["Leche de cabra"], note: "sinónimo" },
  { q: "queso para pizza", expected: ["Queso mozzarella"] },
  { q: "regalo hecho a mano", expected: ["Canasta de mimbre", "Vela de soya", "Tazas de cerámica", "Bufanda de lana"] },
  { q: "algo para untar en el pan", expected: ["Mermelada casera de mora", "Mantequilla"] },
  { q: "desayuno con yogurt", expected: ["Yogur natural"], note: "ortografía alternativa" },
  { q: "pastel de cumpleaños", expected: ["Torta de chocolate"], note: "sinónimo" },
  { q: "pan artesanal fermentado", expected: ["Pan de masa madre"] },
  { q: "cosas para abrigarse", expected: ["Bufanda de lana"] },
  { q: "jabón natural", expected: ["Jabón artesanal"] },
  { q: "fresa", expected: ["Fresas"], note: "singular" },
  // No answer in the catalog
  { q: "televisor", expected: [], note: "sin respuesta" },
  { q: "laptop gamer", expected: [], note: "sin respuesta" },
  { q: "zapatos deportivos", expected: [], note: "sin respuesta" },
  { q: "repuestos de automóvil", expected: [], note: "sin respuesta" },
];

const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
};

/** Voyage accounts without a payment method allow ~3 requests per minute: wait and retry on 429 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof EmbeddingsError) || error.status !== 429 || i >= attempts) throw error;
      console.warn(`Voyage rate limit (429), retrying in 25s (${i}/${attempts - 1})...`);
      await new Promise((resolve) => setTimeout(resolve, 25_000));
    }
  }
}

async function main() {
  if (!embeddingsAvailable()) {
    throw new Error("VOYAGE_API_KEY is empty: the evaluation needs the real Voyage API");
  }
  const documents = CATALOG.map(buildProductDocument);
  const docVectors = await withRetry(() => embedDocuments(documents));
  const queryVectors = await withRetry(() => embedQueries(QUERIES.map((q) => q.q)));

  const rows: Record<string, unknown>[] = [];
  const hitSimilarities: number[] = [];
  const noAnswerBest: number[] = [];
  let recallSum = 0, mrrSum = 0, answerable = 0;

  QUERIES.forEach((query, i) => {
    const ranking = CATALOG.map((item, j) => ({ name: item.name, similarity: cosine(queryVectors[i], docVectors[j]) })).sort(
      (a, b) => b.similarity - a.similarity
    );
    const top5 = ranking.slice(0, 5);

    if (query.expected.length === 0) {
      noAnswerBest.push(top5[0].similarity);
      rows.push({ q: query.q, kind: "no-answer", best: top5[0].name, similarity: +top5[0].similarity.toFixed(3) });
      return;
    }
    answerable++;
    const found = query.expected.filter((name) => top5.some((r) => r.name === name));
    const recall = found.length / query.expected.length;
    const firstRank = ranking.findIndex((r) => query.expected.includes(r.name)) + 1;
    recallSum += recall;
    mrrSum += 1 / firstRank;
    for (const name of found) hitSimilarities.push(ranking.find((r) => r.name === name)!.similarity);
    rows.push({ q: query.q, kind: query.note ?? "answer", recall5: +recall.toFixed(2), firstRank, topSimilarity: +top5[0].similarity.toFixed(3) });
  });

  const recallAt5 = recallSum / answerable;
  const mrr = mrrSum / answerable;
  const noAnswerMax = Math.max(...noAnswerBest);
  const hitMin = Math.min(...hitSimilarities);

  console.table(rows);
  const summary = {
    model: embeddingModelName(),
    catalogSize: CATALOG.length,
    answerableQueries: answerable,
    noAnswerQueries: noAnswerBest.length,
    recallAt5: +recallAt5.toFixed(3),
    mrr: +mrr.toFixed(3),
    noAnswerBestSimilarityMax: +noAnswerMax.toFixed(3),
    correctHitSimilarityMin: +hitMin.toFixed(3),
    // A threshold above every no-answer query and below the weakest correct hit separates them
    suggestedMinSimilarity: noAnswerMax < hitMin ? +((noAnswerMax + hitMin) / 2).toFixed(2) : +(noAnswerMax + 0.02).toFixed(2),
    overlap: noAnswerMax >= hitMin,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (recallAt5 < 0.8) {
    console.error(`recall@5 ${recallAt5.toFixed(2)} is below the 0.8 target`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
