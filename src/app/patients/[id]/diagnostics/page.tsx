import { AppShell } from "@/components/app-shell";
import { PatientDiagnostics } from "@/components/patient-diagnostics";

export default async function PatientDiagnosticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AppShell><PatientDiagnostics patientId={id} /></AppShell>;
}
