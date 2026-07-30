import * as React from "react"
import {
  ToastProvider as ToastProviderPrimitive,
  ToastViewport as ToastViewportPrimitive,
  Toast as ToastPrimitive,
  ToastTitle as ToastTitlePrimitive,
  ToastDescription as ToastDescriptionPrimitive,
  ToastClose as ToastClosePrimitive,
  ToastAction as ToastActionPrimitive,
} from "@radix-ui/react-toast"

import { useToast } from "@/hooks/use-toast"
import { X } from "lucide-react"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProviderPrimitive>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <ToastPrimitive
            key={id}
            className="group relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full bg-card border-card-border text-foreground"
            {...props}
          >
            <div className="grid gap-1">
              {title && <ToastTitlePrimitive className="text-sm font-semibold">{title}</ToastTitlePrimitive>}
              {description && (
                <ToastDescriptionPrimitive className="text-sm opacity-90">
                  {description}
                </ToastDescriptionPrimitive>
              )}
            </div>
            {action}
            <ToastClosePrimitive className="absolute right-2 top-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100">
              <X className="h-4 w-4" />
            </ToastClosePrimitive>
          </ToastPrimitive>
        )
      })}
      <ToastViewportPrimitive className="fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]" />
    </ToastProviderPrimitive>
  )
}
