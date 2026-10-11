/**
 * The suite runs in India's time zone on every machine, so a test can write out the
 * date and time a screen must show ("11 Oct 2026, 2:45 pm") instead of computing it
 * with the formatter it checks. Set here because a test cannot change the zone itself:
 * Jest gives each test file a copy of process.env.
 */
module.exports = async () => {
  process.env.TZ = 'Asia/Kolkata';
};
