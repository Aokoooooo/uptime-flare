import { pageConfig } from '../../public.config'

export function Header() {
  const links = [{ label: '事件记录', link: '/incidents' }, ...(pageConfig.links ?? [])]

  return (
    <header className="header">
      <div className="container header-inner">
        <a className="brand" href="/">
          <img className="brand-logo" src={pageConfig.logo ?? '/logo.svg'} alt="" />
          <span>{pageConfig.title ?? '服务状态'}</span>
        </a>
        <nav className="nav" aria-label="主导航">
          {links.map((link) => (
            <a
              className="nav-link"
              href={link.link}
              key={`${link.label}-${link.link}`}
              target={link.link.startsWith('/') ? undefined : '_blank'}
              rel={link.link.startsWith('/') ? undefined : 'noreferrer'}
              data-active={link.highlight}
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  )
}
