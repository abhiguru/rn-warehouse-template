/**
 * The template terms and privacy notice (WH-140), in the order and words of
 * product/specs/legal-pages-template.md ("Template text (for the lawyer review)").
 *
 * REVIEW GATE: this text is NOT lawyer-reviewed. `LEGAL_TEXT_REVIEWED` in
 * src/constants/legal.ts stays false until the reviewed text replaces it, and the
 * release check refuses a public build until then. Change the words only with a new
 * `LEGAL_UPDATED` date.
 *
 * Nothing here prints a placeholder: a missing facility value is written around
 * ("the cold storage that runs your server") or, in the contact sections, shown as
 * `notGiven`; with no server connected the contact sections give no contact at all.
 */
import type { LegalParty } from '@/constants/legal';

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  /** Paragraphs after the bullets. */
  after?: string[];
}

const UNNAMED = 'the cold storage that runs your server';

/** The facility's name in a sentence, or the unnamed form. */
const facilityName = (party: LegalParty): string => party.legal?.legalName || party.name || UNNAMED;

const seatOf = (party: LegalParty): string =>
  [party.legal?.city, party.legal?.state].filter(Boolean).join(', ');

const contactLines = (party: LegalParty, notGiven: string): string[] => [
  `Email: ${party.legal?.grievanceEmail || notGiven}`,
  `Phone: ${party.legal?.grievancePhone || notGiven}`,
];

export function templateTerms(party: LegalParty, notGiven: string): LegalSection[] {
  const named = facilityName(party) !== UNNAMED;
  const seat = seatOf(party);
  return [
    {
      title: '1. Who these terms are between',
      paragraphs: [
        named
          ? `These terms are between you and ${facilityName(party)} ("the cold storage"), which runs the server this app connects to. The cold storage alone provides the services described here. The app is open-source software published under the MIT licence; its authors are not a party to these terms and provide the software "as is".`
          : 'These terms are between you and the cold storage that runs the server this app connects to ("the cold storage"). The cold storage alone provides the services described here. The app is open-source software published under the MIT licence; its authors are not a party to these terms and provide the software "as is".',
      ],
    },
    {
      title: '2. Your agreement for storage',
      paragraphs: [
        'Rent, labour, payment, cancellation and refunds are set by your written agreement with the cold storage, not by these terms. Amounts are shown before tax unless stated.',
      ],
    },
    {
      title: '3. Using the app',
      paragraphs: [
        'By signing in you accept these terms and the privacy notice. The app lets you see and, where your role allows, record customers, goods received (GRNs), dispatches, invoices and stock.',
      ],
    },
    {
      title: '4. Your sign-in',
      paragraphs: [
        'You sign in with your mobile number and a one-time code. Keep codes private, and tell the cold storage if someone else uses your sign-in. The cold storage decides your role and which customers you can see, and may change or end your access at any time.',
      ],
    },
    {
      title: '5. Fair use',
      paragraphs: [
        "Use the app only for lawful purposes and only for the cold storage's business. Do not try to reach records your role does not allow, disturb the server, or copy data out of the app in bulk.",
      ],
    },
    {
      title: '6. Phone permissions',
      paragraphs: [
        "The app asks for the camera (to photograph goods and documents), for photos you choose to attach, and on iPhone for the local network (to reach the server over the warehouse Wi-Fi). You can withdraw these in your phone's settings.",
      ],
    },
    {
      title: '7. Records',
      paragraphs: [
        "The records you enter belong to the cold storage and are kept on its own server. The software is licensed under MIT, and the licence and its notices are shown in the app.",
      ],
    },
    {
      title: '8. No warranty',
      paragraphs: [
        'The app and the server software are provided "as is". The cold storage keeps its records with reasonable care, but cannot promise the app will always be available, for example during a power or internet outage.',
      ],
    },
    {
      title: '9. Liability',
      paragraphs: [
        'To the extent the law allows, the cold storage is not liable for indirect or consequential loss arising from use of the app. Nothing in these terms limits liability that the law does not allow to be limited, or your rights under your storage agreement.',
      ],
    },
    {
      title: '10. Changes',
      paragraphs: [
        'The cold storage may update these terms. The date at the top changes when it does, and continued use after an update means you accept it.',
      ],
    },
    {
      title: '11. Disputes and law',
      paragraphs: [
        seat
          ? `These terms are governed by the laws of India. The courts at ${seat} have jurisdiction, without affecting any arbitration clause in your storage agreement.`
          : 'These terms are governed by the laws of India. The courts where the cold storage has its seat have jurisdiction, without affecting any arbitration clause in your storage agreement.',
      ],
    },
    party.connected
      ? { title: '12. Contact', paragraphs: [`${facilityName(party)}:`], bullets: contactLines(party, notGiven) }
      : { title: '12. Contact', paragraphs: [`Contact ${UNNAMED}.`] },
  ];
}

export function templatePrivacy(party: LegalParty, notGiven: string): LegalSection[] {
  const named = facilityName(party) !== UNNAMED;
  const seat = seatOf(party);
  const grievanceHeading = [facilityName(party), seat].filter(Boolean).join(', ');
  return [
    {
      title: '1. Who decides how your data is used',
      paragraphs: [
        `${named ? `${facilityName(party)} ("the cold storage")` : 'The cold storage that runs your server'} decides why and how your personal data in this app is processed. It is the Data Fiduciary under the Digital Personal Data Protection Act, 2023. The data is kept on the cold storage's own server.`,
      ],
    },
    {
      title: '2. What is collected, and why',
      bullets: [
        'Your mobile number and name, to sign you in with a one-time code and to show who recorded what.',
        'For customers: name, address, phone, GSTIN and PAN, to keep storage records and issue invoices as GST law requires.',
        "The records you enter, and photos of goods and documents, as the cold storage's business records.",
        'For each signed-in phone: its IP address and app description, to keep your sign-in secure and to let you sign out other phones.',
      ],
    },
    {
      title: '3. What stays on your phone',
      paragraphs: [
        'Your choices (language, appearance), the server address, your signed-in session (in secure storage), recent customers and items, form drafts, report answers and the last loaded list pages. All of these except your choices are cleared when you sign out. Nothing is copied to your Google account by Android backup.',
      ],
    },
    {
      title: '4. Who else receives it',
      bullets: [
        'Staff of the cold storage, according to their role. Customers see only their own records.',
        'The SMS provider that delivers your code (your number and the code).',
        "Where your copy of the app uses an association's sign-in, that association keeps your mobile number and name.",
        'Crash reports, only if the distributor of your copy of the app switches them on: app version, phone model, role and error text.',
        'Authorities, where the law requires it.',
      ],
      after: ['The cold storage does not sell your data.'],
    },
    {
      title: '5. How long it is kept',
      paragraphs: [
        'Business records, including invoices and photos, are kept for as long as the cold storage needs them and at least as long as tax law requires. Sign-in records and generated documents are kept for shorter periods, which the cold storage sets.',
      ],
    },
    {
      title: '6. Security',
      paragraphs: [
        'Connections are encrypted over the internet. If the cold storage offers its warehouse network as a fallback during an internet outage, connections over that Wi-Fi are not encrypted while it is in use, and others on that network could read them. Access is limited by role and can be removed at any time.',
      ],
    },
    {
      title: '7. Your rights',
      paragraphs: [
        'You may ask the cold storage for a summary of your personal data and how it is used, ask for it to be corrected or completed, ask for it to be erased where the law does not require it to be kept, and nominate a person to act for you. Contact the grievance officer below. If you are not satisfied with the answer, you may complain to the Data Protection Board of India.',
      ],
    },
    {
      title: '8. Children',
      paragraphs: [
        'The app is for people who work with or store goods at the cold storage, and is not meant for children.',
      ],
    },
    {
      title: '9. Changes',
      paragraphs: ['The date at the top changes when this notice changes.'],
    },
    party.connected
      ? {
          title: '10. Grievance officer',
          paragraphs: [grievanceHeading],
          bullets: [`Name: ${party.legal?.grievanceName || notGiven}`, ...contactLines(party, notGiven)],
        }
      : {
          title: '10. Grievance officer',
          paragraphs: [`Ask ${UNNAMED} for its grievance officer.`],
        },
  ];
}
