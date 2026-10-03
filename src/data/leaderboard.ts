import avatar from '../assets/leaderboard/avatar.png'
import avatarCircle from '../assets/leaderboard/avatar-circle.png'
import avatar1st from '../assets/leaderboard/avatar-1st.png'
import avatar2nd from '../assets/leaderboard/avatar-2nd.png'
import avatar3rd from '../assets/leaderboard/avatar-3rd.png'

export const AFFILIATE_CODE = 'Kingkulbik'

/*
 * Avatars come from the design, not the API: every place shows the character
 * it has in the Figma file (Stake's leaderboard export has no avatars).
 */
export const podiumAvatars: Record<1 | 2 | 3, string> = { 1: avatar1st, 2: avatar2nd, 3: avatar3rd }

export const rowAvatar = (place: number) =>
  place === 4
    ? { src: avatarCircle, shape: 'circle' as const }
    : { src: avatar, shape: 'square' as const }

export const formatUsd = (value: number, fractionDigits = 0) =>
  value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
