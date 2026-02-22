'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import {
  ClipboardList, BarChart2, Settings, Printer,
  FlaskConical, LogOut, Wheat, ChevronRight,
  TrendingUp, Edit3, Package, Upload
} from 'lucide-react'

const NAV_ITEMS = [
  { href: '/orders',          label: 'New Order',    icon: ClipboardList, roles: ['admin', 'staff', 'baker'] },
  { href: '/orders/edit',     label: 'Edit Orders',  icon: Edit3,         roles: ['admin', 'staff'] },
  { href: '/production',      label: 'Production',   icon: BarChart2,     roles: ['admin', 'staff', 'baker'] },
  { href: '/forecast',        label: 'Forecast',     icon: TrendingUp,    roles: ['admin', 'staff', 'baker'] },
  { href: '/mixsheet',        label: 'Mix Sheet',    icon: FlaskConical,  roles: ['admin', 'staff', 'baker'] },
  { href: '/stickers',        label: 'Stickers',     icon: Printer,       roles: ['admin', 'staff', 'baker'] },
  { href: '/admin',           label: 'Customers',    icon: Settings,      roles: ['admin'] },
  { href: '/admin/products',  label: 'Products',     icon: Package,       roles: ['admin'] },
  { href: '/admin/import',    label: 'Import CSV',   icon: Upload,        roles: ['admin'] },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { appUser, logOut } = useAuth()

  const visibleItems = NAV_ITEMS.filter(item =>
    appUser ? item.roles.includes(appUser.role) : false
  )

  return (
    <aside className="w-56 min-h-screen bg-bark-900 flex flex-col fixed left-0 top-0 z-40 shadow-2xl">
      {/* Logo */}
      <div className="px-5 pt-7 pb-6 border-b border-cream-50/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-wheat-500 rounded flex items-center justify-center">
            <Wheat className="w-4 h-4 text-cream-50" />
          </div>
          <div>
            <div className="font-display text-cream-50 text-sm leading-tight">Newlight</div>
            <div className="text-wheat-400 text-xs font-mono">Breadworks</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-0.5">
        {visibleItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/orders' && pathname.startsWith(href))
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm font-body transition-all duration-150 group relative
                ${active ? 'bg-wheat-500 text-cream-50' : 'text-cream-200/70 hover:text-cream-50 hover:bg-cream-50/10'}`}>
              <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-cream-50' : 'text-wheat-400 group-hover:text-wheat-300'}`} />
              <span className="flex-1">{label}</span>
              {active && <ChevronRight className="w-3 h-3 text-cream-50/60" />}
            </Link>
          )
        })}
      </nav>

      {/* User Footer */}
      {appUser && (
        <div className="px-4 py-4 border-t border-cream-50/10">
          <div className="mb-2">
            <div className="text-cream-100 text-sm font-body truncate">{appUser.name}</div>
            <div className="text-wheat-400 text-xs font-mono capitalize">{appUser.role}</div>
          </div>
          <button onClick={() => logOut()}
            className="flex items-center gap-2 text-cream-200/60 hover:text-cream-100 text-xs transition-colors w-full py-1">
            <LogOut className="w-3 h-3" />
            Sign out
          </button>
        </div>
      )}
    </aside>
  )
}
