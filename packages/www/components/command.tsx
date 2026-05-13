"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";

export function Command({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button data-copy data-slot="command" onClick={copy} type="button">
      <span>{value}</span>
      {copied ? (
        <Check aria-hidden="true" size={16} />
      ) : (
        <Copy aria-hidden="true" size={16} />
      )}
    </button>
  );
}
