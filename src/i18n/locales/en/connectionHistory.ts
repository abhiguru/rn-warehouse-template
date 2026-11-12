/** Settings > Warehouse tools > Connection history (WH-177; backend migration 188). */
export const connectionHistory = {
  title: 'Connection history',
  subtitle: 'How often phones could not reach the server',
  intro: 'The last 30 days. A gap is a time when a phone, with the app open and signed in, could reach the server neither over the internet nor over the warehouse network.',
  noGaps: 'No gaps',
  summaryGaps: 'Gaps: {{count}} · Longest: {{longest}} · Total: {{total}}',
  summaryPhones: 'Phones: {{count}} · Saves tried: {{saves}} · Answers lost: {{lost}}',
  hours: '{{hours}} h {{minutes}} min',
  minutes: '{{minutes}} min {{seconds}} s',
  seconds: '{{seconds}} s',
  loadFailed: 'Could not load the connection history.',
  unsupported: 'This server needs an update before it can show the connection history.',
  adminsOnlyTitle: 'Administrators only',
  adminsOnlyMessage: 'Only an administrator can see the connection history.',
  backToSettings: 'Back to Settings',
};
