import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";

export const metadata: Metadata = {
  title: "BIG Payroll",
  description: "Dental clinic payroll management system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#04080F] text-[#E8F0FF] min-h-screen">
        <div className="flex">
          <Sidebar />
          <main className="flex-1 lg:ml-60 min-h-screen">
            <MobileNav />
            <div className="p-4 lg:p-8">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
