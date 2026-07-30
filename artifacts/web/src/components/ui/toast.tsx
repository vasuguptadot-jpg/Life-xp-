import * as React from "react"
import { type VariantProps, cva } from "class-variance-authority"
import * as ToastPrimitives from "@radix-ui/react-toast"

const ToastProvider = ToastPrimitives.Provider
const ToastViewport = ToastPrimitives.Viewport
const Toast = ToastPrimitives.Root
const ToastTitle = ToastPrimitives.Title
const ToastDescription = ToastPrimitives.Description
const ToastClose = ToastPrimitives.Close
const ToastAction = ToastPrimitives.Action

export type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>
export type ToastActionElement = React.ReactElement<typeof ToastAction>

export {
  type ToastProvider,
  type ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
}
