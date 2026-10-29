/*
 * The race that ended 29 Oct 2026 (29 Sep – 28 Oct), the first in Previous
 * Leaderboards: its final standings from Stake's API, taken the way the
 * server archives every race after it (server/leaderboardArchive.ts), with
 * names masked as on the live board.
 */

import type { ArchivedRace } from '../shared/leaderboard.js'

export const SEED_RACES: ArchivedRace[] = [
  {
    id: '2026-09-29',
    start: 1790640000000,
    end: 1793232000000,
    boards: {
      weighted: {
        prizes: [
          12500,
          7500,
          5000,
          1800,
          1000,
          650,
          450,
          300,
          200,
          100,
          100,
          100,
          100,
          100,
          100
        ],
        entries: [
          {
            rank: 1,
            name: 'mar***ki',
            wagered: 4370971.6,
            weighted: 3195107.31,
            prize: 12500
          },
          {
            rank: 2,
            name: 'bar***12',
            wagered: 3958472.38,
            weighted: 3137398.81,
            prize: 7500
          },
          {
            rank: 3,
            name: 'Wil***en',
            wagered: 3960104.32,
            weighted: 1223419.13,
            prize: 5000
          },
          {
            rank: 4,
            name: 'Ayr***ke',
            wagered: 1378614.73,
            weighted: 1189408.48,
            prize: 1800
          },
          {
            rank: 5,
            name: 'EWe***r2',
            wagered: 898633.02,
            weighted: 733919.52,
            prize: 1000
          },
          {
            rank: 6,
            name: 'Ayd***t9',
            wagered: 645089.43,
            weighted: 639337.2,
            prize: 650
          },
          {
            rank: 7,
            name: 'Cal***90',
            wagered: 859030.13,
            weighted: 634317.75,
            prize: 450
          },
          {
            rank: 8,
            name: 'Yor***ka',
            wagered: 1476294.8,
            weighted: 566029.55,
            prize: 300
          },
          {
            rank: 9,
            name: 'Geo***ta',
            wagered: 1438889.51,
            weighted: 530498.33,
            prize: 200
          },
          {
            rank: 10,
            name: 'unh***ng',
            wagered: 431291.48,
            weighted: 424822.19,
            prize: 100
          },
          {
            rank: 11,
            name: 'Tha***r1',
            wagered: 504850.5,
            weighted: 284532.51,
            prize: 100
          },
          {
            rank: 12,
            name: 'Vol***45',
            wagered: 795029.49,
            weighted: 273677.95,
            prize: 100
          },
          {
            rank: 13,
            name: 'pif***ss',
            wagered: 249499.38,
            weighted: 249499.38,
            prize: 100
          },
          {
            rank: 14,
            name: 'Kur***en',
            wagered: 2389570.06,
            weighted: 238957.01,
            prize: 100
          },
          {
            rank: 15,
            name: 'Bal***24',
            wagered: 528664.11,
            weighted: 165673.85,
            prize: 100
          }
        ]
      },
      exclusive: {
        prizes: [
          3500,
          1900,
          1200,
          800,
          650,
          500,
          400,
          350,
          350,
          350
        ],
        entries: [
          {
            rank: 1,
            name: 'bar***12',
            wagered: 3046168.41,
            weighted: 3046168.41,
            prize: 3500
          },
          {
            rank: 2,
            name: 'mar***ki',
            wagered: 2957114.97,
            weighted: 2956864.97,
            prize: 1900
          },
          {
            rank: 3,
            name: 'Ayr***ke',
            wagered: 1278212.17,
            weighted: 1179368.22,
            prize: 1200
          },
          {
            rank: 4,
            name: 'EWe***r2',
            wagered: 715618.02,
            weighted: 715618.02,
            prize: 800
          },
          {
            rank: 5,
            name: 'Cal***90',
            wagered: 707541.05,
            weighted: 617564.6,
            prize: 650
          },
          {
            rank: 6,
            name: 'Geo***ta',
            wagered: 405000.01,
            weighted: 405000.01,
            prize: 500
          },
          {
            rank: 7,
            name: 'Ayd***t9',
            wagered: 267804.93,
            weighted: 267804.93,
            prize: 400
          },
          {
            rank: 8,
            name: 'Yor***ka',
            wagered: 267512.54,
            weighted: 267512.54,
            prize: 350
          },
          {
            rank: 9,
            name: 'Tha***r1',
            wagered: 298549.41,
            weighted: 262880.91,
            prize: 350
          },
          {
            rank: 10,
            name: 'Wil***en',
            wagered: 233927,
            weighted: 233927,
            prize: 350
          }
        ]
      }
    },
    archivedAt: 1793244225346,
    source: 'api'
  },
]
