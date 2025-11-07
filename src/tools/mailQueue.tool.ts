import { Queue, Worker, JobsOptions, Job } from "bullmq";
import IORedis from "ioredis";

export type MailJobPayload = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
};

const connection = new IORedis({
  host: "localhost",
  port: 6379,
  maxRetriesPerRequest: null,
});

export const mailQueue = new Queue<MailJobPayload>("mailQueue", { connection });

export function enqueueMail(payload: MailJobPayload, opts?: JobsOptions) {
  return mailQueue.add("send", payload, opts);
}

export function initMailWorker() {
  const worker = new Worker<MailJobPayload>(
    "mailQueue",
    async (job: Job<MailJobPayload>) => {
      const { to, subject, html, text } = job.data;
      console.log(`[mail:worker] sending to=${to} subject=${subject} text=${text?.slice(0, 120)}`);
    },
    { connection }
  );

  worker.on("completed", (job: Job) => {
    console.log(`[mail:worker] job ${job.id} completed`);
  });
  worker.on("failed", (job: Job | undefined, err: Error) => {
    console.error(`[mail:worker] job ${job?.id} failed`, err);
  });

  return worker;
}
