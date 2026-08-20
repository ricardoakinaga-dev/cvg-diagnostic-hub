import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";

const endpoint = required(process.env.STORAGE_ENDPOINT, "STORAGE_ENDPOINT");
const bucket = required(process.env.STORAGE_BUCKET, "STORAGE_BUCKET");
const accessKeyId = required(process.env.STORAGE_ACCESS_KEY, "STORAGE_ACCESS_KEY");
const secretAccessKey = required(process.env.STORAGE_SECRET_KEY, "STORAGE_SECRET_KEY");
const client = new S3Client({ endpoint, region: process.env.STORAGE_REGION ?? "us-east-1", forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE !== "false", credentials: { accessKeyId, secretAccessKey } });

async function main(): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`Bucket ${bucket} já existe.`);
    return;
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`Bucket ${bucket} criado em endpoint S3-compatible.`);
  }
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} é obrigatório para inicializar o storage.`);
  return value.trim();
}

void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Falha ao inicializar storage."); process.exitCode = 1; });
