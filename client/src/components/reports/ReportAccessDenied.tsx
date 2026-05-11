import { ShieldOff } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface ReportAccessDeniedProps {
  reportLabel: string;
}

export function ReportAccessDenied({ reportLabel }: ReportAccessDeniedProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <ShieldOff className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">{reportLabel} isn't available on your account</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have access to {reportLabel.toLowerCase()} reports. Ask an admin to grant access, or head back to prepare a report you can run.
        </p>
        <div className="mt-6">
          <Link href="/workflow">
            <Button data-testid="button-back-to-prepare">
              Back to Prepare a Report
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ReportAccessDenied;
