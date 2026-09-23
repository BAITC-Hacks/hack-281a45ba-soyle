import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/layout/header";

export const metadata: Metadata = {
  title: "SOYLE — бизнес-задачи для студенческих команд",
  description: "Платформа, которая помогает бизнесу подготовить задачу и найти студенческую команду.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <Header />
        <main className="container-page py-8 sm:py-10">{children}</main>
      </body>
    </html>
  );
}
