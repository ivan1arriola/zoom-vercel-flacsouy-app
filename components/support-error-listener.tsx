"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Snackbar } from "@mui/material";
import {
  reportSupportError,
  toSerializableError,
  type SupportErrorReportSource
} from "@/src/lib/support-error-report.client";
import {
  buildSupportContactMessage,
  SUPPORT_EMAIL,
  SUPPORT_MAILTO
} from "@/src/lib/support-contact";

const MAX_REPORTS_PER_SESSION = 10;

export function SupportErrorListener() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string>(buildSupportContactMessage());
  const seenFingerprintsRef = useRef<Set<string>>(new Set());
  const reportsSentRef = useRef(0);

  useEffect(() => {
    const sendReport = async (
      source: SupportErrorReportSource,
      rawMessage: string,
      stack?: string
    ) => {
      const normalizedMessage = rawMessage.trim() || "Error inesperado";
      const fingerprint = `${source}|${normalizedMessage}|${stack ?? ""}`.slice(0, 4000);

      setMessage(buildSupportContactMessage("Ocurrio un error inesperado."));
      setOpen(true);

      if (seenFingerprintsRef.current.has(fingerprint)) return;
      if (reportsSentRef.current >= MAX_REPORTS_PER_SESSION) return;

      seenFingerprintsRef.current.add(fingerprint);
      reportsSentRef.current += 1;

      await reportSupportError({
        source,
        message: normalizedMessage,
        stack
      });
    };

    const onWindowError = (event: ErrorEvent) => {
      const serialized = toSerializableError(event.error ?? event.message);
      void sendReport(
        "window.error",
        serialized.message || "Error de JavaScript no controlado.",
        serialized.stack
      );
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const serialized = toSerializableError(event.reason);
      void sendReport(
        "window.unhandledrejection",
        serialized.message || "Promesa rechazada sin manejo.",
        serialized.stack
      );
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return (
    <Snackbar
      open={open}
      autoHideDuration={15000}
      onClose={() => setOpen(false)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert
        severity="error"
        onClose={() => setOpen(false)}
        variant="filled"
        action={
          <Button color="inherit" size="small" href={SUPPORT_MAILTO}>
            {SUPPORT_EMAIL}
          </Button>
        }
        sx={{ width: "100%", alignItems: "center" }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
