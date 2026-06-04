export const TRIAL_DAYS = 30
export const DAY_IN_MS = 24 * 60 * 60 * 1000

export const getTrialEndsAt = (startDate = new Date()) => (
  new Date(startDate.getTime() + TRIAL_DAYS * DAY_IN_MS)
)
