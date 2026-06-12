interface PageHeaderProps {
  title: string
  subtitle: string
  children?: React.ReactNode
}

export function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-6 py-4 flex-shrink-0 flex-wrap border-b bg-white">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
