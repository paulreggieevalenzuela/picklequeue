"use client";

import { useCallback } from "react";
import type { UseSession } from "@/lib/hooks";
import { toast, toastError } from "@/lib/toast";
import type { Run } from "./types";

export function useRun(session: Pick<UseSession, "dispatch">): Run {
  const { dispatch } = session;
  return useCallback<Run>(
    (cmd, success) => {
      const res = dispatch(cmd);
      if (!res.ok) toastError(res.error);
      else if (success) toast(success);
      return res.ok;
    },
    [dispatch],
  );
}
