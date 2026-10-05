import type { ReactNode } from 'react'
import './PageHeading.css'

type PageHeadingProps = {
  icon: string
  /** First word, in gold (e.g. "ACTIVE") */
  gold: string
  /** The rest of the title, in silver (e.g. "CHALLENGES") */
  rest: string
  children: ReactNode
}

/** The heading at the top of a section page: icon, gold + silver Titan One title, one-line subtitle */
export default function PageHeading({ icon, gold, rest, children }: PageHeadingProps) {
  return (
    <header className="page-heading">
      <img className="page-heading__icon" src={icon} width={31} height={31} alt="" />
      <div>
        <h1 className="page-heading__title">
          <span className="page-heading__gold">{gold}</span> <span className="page-heading__silver">{rest}</span>
        </h1>
        <p className="page-heading__subtitle">{children}</p>
      </div>
    </header>
  )
}
