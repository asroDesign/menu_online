import { redirect } from "next/navigation";

export default function PrintersSettingsRedirect() {
  redirect("/dashboard/settings/printers/devices");
}
