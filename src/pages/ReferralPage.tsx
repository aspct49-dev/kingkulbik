import bg from '../assets/referral/bg.webp'
import symbolChip from '../assets/referral/symbol-chip.webp'
import symbolK from '../assets/referral/symbol-k.webp'
import symbolReveal from '../assets/referral/symbol-reveal.webp'
import symbolCowboy from '../assets/referral/symbol-cowboy.webp'
import discordIcon from '../assets/referral/discord.svg'
import CopyCodeButton from '../components/CopyCodeButton'
import FloatingSymbol from '../components/FloatingSymbol'
import { socials } from '../data/links'
import './ReferralPage.css'

/** $1,000 for referring an eligible high roller to the code */
export default function ReferralPage() {
  return (
    <div className="referral-page">
      <div className="referral-page__bg" style={{ backgroundImage: `url(${bg})` }} aria-hidden />

      <section className="referral">
        <FloatingSymbol
          className="referral__symbol referral__symbol--reveal"
          src={symbolReveal}
          size={{ width: 65.445, height: 68.986 }}
          rotation={11.07}
          idle={0}
        />
        <FloatingSymbol
          className="referral__symbol referral__symbol--k"
          src={symbolK}
          size={109.187}
          rotation={-12.16}
          idle={1.4}
        />
        <FloatingSymbol
          className="referral__symbol referral__symbol--cowboy"
          src={symbolCowboy}
          size={{ width: 121.734, height: 131.538 }}
          rotation={-10.97}
          idle={2.6}
        />
        <FloatingSymbol
          className="referral__symbol referral__symbol--chip"
          src={symbolChip}
          size={158}
          rotation={6.62}
          idle={3.5}
        />

        <h1 className="referral__title">
          <span className="referral__kicker">Bring a High Roller &amp; earn</span>
          <span className="referral__amount">
            $1<span className="referral__comma">,</span>000
          </span>
          <span className="referral__word">REFERRAL</span>
        </h1>

        <p className="referral__subtitle">
          Refer an eligible high roller to code <span className="referral__accent">KINGKULBIK</span> and earn a{' '}
          <br />
          one-time referral reward.
        </p>

        <div className="referral__actions">
          <a
            className="referral__button referral__button--gold"
            href={socials.discord.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Discuss a Referral
          </a>
          <CopyCodeButton className="referral__code" />
          <a
            className="referral__button referral__button--discord"
            href={socials.discord.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <img src={discordIcon} width={20} height={16} alt="" />
            Join Discord
          </a>
        </div>
      </section>
    </div>
  )
}
