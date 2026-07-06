import { pageConfig } from '../../public.config'

export function Footer() {
  if (!pageConfig.customFooter) return null

  return (
    <footer className="footer">
      <div className="container">{pageConfig.customFooter}</div>
    </footer>
  )
}
