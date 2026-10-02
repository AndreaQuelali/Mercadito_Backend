import { servicesBackend } from "./backend";
import { redisKv } from "./kv";
import { getLlmClient } from "./llm";
import { createAssistantService } from "./assistant.service";

/** The real wiring: Redis, the existing services and the configured model. Tests mock this module. */
export const kv = redisKv;
export const backend = servicesBackend;
export const assistant = createAssistantService({ kv, backend, llm: getLlmClient });
