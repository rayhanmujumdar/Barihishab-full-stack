"use client";

import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { catchError, type ErrorInfo } from "next/error";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { translator, type Locale } from "@/lib/i18n";
import { blockLabel, type HomeBlockName } from "./format";

function BlockFailed(props: { locale: Locale; block: HomeBlockName }, { retry }: ErrorInfo) {
  const tr = translator(props.locale);
  return (
    <Alert variant="destructive" role="alert">
      <ExclamationTriangleIcon aria-hidden />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{tr("home.block.failed", { block: blockLabel(props.locale, props.block) })}</span>
        <Button variant="secondary" onClick={() => retry()}>
          {tr("home.block.retry")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** One Home block's error boundary: "Couldn't load {block}. Try again" re-fetches only that block (F11, design D2). */
export const BlockBoundary = catchError(BlockFailed);
