import { AppShell } from "@/components/app-shell";
import { RequestDetail } from "@/components/request-detail";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppShell>
      <RequestDetail requestId={id} />
    </AppShell>
  );
}
