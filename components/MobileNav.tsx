"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Calculator, BarChart3, Stethoscope, CalendarDays } from "lucide-react";

const items = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/staff", label: "Staff", icon: Users },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/payroll", label: "Payroll", icon: Calculator },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

export default function MobileNav() {
  const path = usePathname();
  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden flex items-center gap-3 px-4 py-4 border-b border-[#1E2D4A] bg-[#070D1A] sticky top-0 z-20">
        <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center">
          <Stethoscope size={14} className="text-white" />
        </div>
        <span className="font-display font-semibold text-sm text-[#E8F0FF]">BIG Payroll</span>
      </div>
      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#070D1A] border-t border-[#1E2D4A] flex">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                active ? "text-teal-400" : "text-[#7B91BC]"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
