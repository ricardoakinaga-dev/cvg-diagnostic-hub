import { z } from "zod";

const expectedVersion = z.number().int().positive().optional();
const boundedText = (max: number) => z.string().trim().min(1).max(max);
const structuredContent = z.record(z.string().max(100), z.unknown()).refine((value) => Object.keys(value).length <= 100, "content has too many fields");

export const emptyCommandSchema = z.object({ expectedVersion }).strict();

export const cancelSchema = z.object({
  reasonCode: boundedText(60),
  reason: z.string().trim().min(1).max(500).optional(),
  itemIds: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  expectedVersion
}).strict().superRefine((value, context) => {
  if (value.itemIds && new Set(value.itemIds).size !== value.itemIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["itemIds"], message: "itemIds must be unique" });
  }
});

export const rejectSchema = z.object({
  reasonCode: boundedText(60),
  note: z.string().trim().min(1).max(2000).optional(),
  expectedVersion
}).strict();

export const sampleSchema = z.object({
  accessionCode: z.string().trim().regex(/^[A-Z0-9][A-Z0-9-]{2,39}$/),
  sampleType: boundedText(100),
  expectedVersion
}).strict();

export const recollectionSchema = z.object({
  reasonCode: boundedText(60),
  note: z.string().trim().min(1).max(2000).optional(),
  expectedVersion
}).strict();

export const scheduleSchema = z.object({
  startsAt: boundedText(100),
  endsAt: boundedText(100),
  resource: boundedText(100),
  reason: z.string().trim().min(1).max(500).optional(),
  expectedVersion
}).strict();

export const resultDraftSchema = z.object({
  narrative: boundedText(20_000),
  conclusion: z.string().trim().min(1).max(5_000).optional(),
  content: structuredContent,
  expectedVersion
}).strict();

export const releaseResultSchema = z.object({ critical: z.boolean().optional(), expectedVersion }).strict();

export const amendResultSchema = z.object({
  reason: boundedText(500),
  narrative: boundedText(20_000),
  conclusion: z.string().trim().min(1).max(5_000).optional(),
  content: structuredContent,
  critical: z.boolean().optional(),
  expectedVersion
}).strict();

export const voidResultSchema = z.object({ reason: boundedText(500), expectedVersion }).strict();

export const reviewResultSchema = z.object({ versionId: boundedText(100), expectedVersion }).strict();

export const attachmentUploadSchema = z.object({
  filename: boundedText(255),
  mimeType: z.string().trim().toLowerCase().min(1).max(100),
  sizeBytes: z.number().int().min(1).max(25 * 1024 * 1024),
  checksum: z.string().trim().regex(/^[a-fA-F0-9]{64}$/),
  expectedVersion
}).strict();

export const attachmentFinalizeSchema = z.object({ expectedVersion }).strict();
export const acknowledgeNotificationSchema = emptyCommandSchema;
