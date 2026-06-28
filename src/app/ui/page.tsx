import type { Metadata } from "next";
import { UIDemo } from "./ui-demo";

export const metadata: Metadata = { title: "UI Components" };

export default function UIPage() {
  return <UIDemo />;
}
