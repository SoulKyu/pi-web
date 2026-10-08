import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { fieldClass } from "./input";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(fieldClass, "min-h-16 resize-y py-2", className)} {...props} />;
}
