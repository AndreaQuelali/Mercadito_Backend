/**
 * Regenerates Mercadito.postman_collection.json from the OpenAPI document.
 * Run with `npm run docs:export` after changing src/docs/endpoints.ts or a validator.
 */
import fs from "fs";
import path from "path";
import { buildOpenApiSpec } from "./openapi";
import { buildPostmanCollection } from "./postman";

const target = path.resolve(__dirname, "../../Mercadito.postman_collection.json");
const collection = buildPostmanCollection(buildOpenApiSpec() as any);

fs.writeFileSync(target, JSON.stringify(collection, null, 2) + "\n");
console.log(`Wrote ${path.relative(process.cwd(), target)}`);
