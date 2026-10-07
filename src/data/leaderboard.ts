import avatarCircle from '../assets/leaderboard/avatar-circle.webp'
import avatar1st from '../assets/leaderboard/avatar-1st.webp'
import avatar2nd from '../assets/leaderboard/avatar-2nd.webp'
import avatar3rd from '../assets/leaderboard/avatar-3rd.webp'

export const AFFILIATE_CODE = 'Kingkulbik'

/*
 * Avatars come from the design, not the API: every place shows the character
 * it has in the Figma file (Stake's leaderboard export has no avatars).
 */
export const podiumAvatars: Record<1 | 2 | 3, string> = { 1: avatar1st, 2: avatar2nd, 3: avatar3rd }

/** Every table row shows the same round avatar */
export const rowAvatar = avatarCircle

export const formatUsd = (value: number, fractionDigits = 0) =>
  value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })
