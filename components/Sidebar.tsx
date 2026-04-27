"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Calculator,
  Clock,
  Upload,
  BarChart3,
  Settings2,
  FileText,
  Stethoscope,
  ChevronRight,
  ClipboardCheck,
  CalendarDays,
} from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/staff", label: "Staff", icon: Users },
  { href: "/schedule", label: "Dr Schedule", icon: CalendarDays },
  { href: "/import", label: "POS Import", icon: Upload },
  { href: "/review", label: "Review & Annotate", icon: ClipboardCheck },
  { href: "/payroll", label: "Payroll", icon: Calculator },
  { href: "/payroll/slips", label: "Payroll Slips", icon: FileText },
  { href: "/attendance", label: "Attendance & OT", icon: Clock },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings/treatments", label: "Treatments Setup", icon: Settings2 },
];

export default function Sidebar() {
  const path = usePathname();

  return (
    <aside className="hidden lg:flex flex-col w-60 min-h-screen border-r border-[#1E2D4A] bg-[#070D1A] fixed left-0 top-0 z-30">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-6 border-b border-[#1E2D4A]">
        <div className="w-9 h-9 rounded-xl bg-teal-600 flex items-center justify-center flex-shrink-0 glow-teal">
          <Stethoscope size={18} className="text-white" />
        </div>
        <div>
          <p className="font-display font-700 text-sm text-[#E8F0FF] leading-tight">BIG Payroll</p>
          <p className="text-[10px] text-[#7B91BC] font-mono uppercase tracking-widest">Payroll System</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link key={href} href={href} className={`sidebar-link ${active ? "active" : ""}`}>
              <Icon size={16} />
              <span>{label}</span>
              {active && <ChevronRight size={12} className="ml-auto opacity-50" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-[#1E2D4A]">
        <p className="text-[10px] text-[#7B91BC] font-mono uppercase tracking-widest">3 Branches Active</p>
        <p className="text-xs text-[#7B91BC] mt-1">April 2026</p>
      </div>
    </aside>
  );
}
