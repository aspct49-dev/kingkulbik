import { socials } from '../../data/links'

/** Nothing running: say so, and point to the stream */
export default function EventsEmpty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <section className="store-gate events-empty">
      <img src={icon} width={42} height={42} alt="" />
      <h2 className="store-gate__title">{title}</h2>
      <p className="store-gate__text">{text}</p>
      <a className="kk-button store-gate__button" href={socials.kick.url} target="_blank" rel="noopener noreferrer">
        Watch on Kick
      </a>
    </section>
  )
}
