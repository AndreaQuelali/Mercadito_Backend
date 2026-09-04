import { Queue, Worker, JobsOptions, Job } from "bullmq";
import IORedis from "ioredis";
import { ENV } from "../config/env.config";

export type MailJobPayload = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
};

const connection = new IORedis({
  host: ENV.REDIS_HOST,
  port: Number(ENV.REDIS_PORT),
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

      // Use nodemailer when SMTP is configured; fall back to console log in dev
      if (ENV.SMTP_HOST) {
        const nodemailer = await import("nodemailer");
        const transporter = nodemailer.createTransport({
          host: ENV.SMTP_HOST,
          port: ENV.SMTP_PORT,
          secure: ENV.SMTP_PORT === 465,
          auth: {
            user: ENV.SMTP_USER,
            pass: ENV.SMTP_PASS,
          },
        });

        await transporter.sendMail({
          from: ENV.SMTP_FROM,
          to,
          subject,
          text,
          html,
        });

        console.log(`[mail:worker] email sent to=${to} subject="${subject}"`);
      } else {
        // Development fallback — log the email content instead of sending
        console.log(
          `[mail:worker] (DEV — no SMTP configured) to=${to} subject="${subject}" text=${text?.slice(0, 120)}`
        );
      }
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
