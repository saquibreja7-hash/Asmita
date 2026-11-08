"use client";

import { useRef } from "react";

// A GET filter form that applies as soon as a select or date changes. The
// Apply button stays for keyboard and no-JavaScript use.
export function AutoSubmitForm({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      className={className}
      method="get"
      onChange={(event) => {
        const target = event.target as HTMLElement;
        if (target.tagName === "SELECT" || (target as HTMLInputElement).type === "date") {
          formRef.current?.requestSubmit();
        }
      }}
      ref={formRef}
    >
      {children}
    </form>
  );
}
