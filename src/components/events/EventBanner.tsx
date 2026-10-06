import './EventBanner.css'

/** The banner at the top of an event page: the Rewards banner's frame and lettering */
export default function EventBanner({ top, main }: { top: string; main: string }) {
  return (
    <header className="event-banner">
      <h1 className="event-banner__title">
        <span className="event-banner__top">{top}</span>
        <span className="event-banner__main">{main}</span>
      </h1>
    </header>
  )
}
