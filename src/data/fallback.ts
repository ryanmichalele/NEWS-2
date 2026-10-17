import {
  article as a,
  bodySections,
  keyFacts,
  protectionTips,
  quotes,
  relatedStories,
  tickerItems,
  timeline,
} from "./article";

export type StaticArticle = {
  outlet: string;
  section: string;
  kicker: string;
  title: string;
  dek: string;
  byline: string;
  published: string;
  updated: string;
  readTime: string;
  location: string;
  heroCaption: string;
  tickerItems: string[];
  editorNote: string;
  bodySections: { heading: string; paragraphs: string[] }[];
  quotes: { text: string; source: string }[];
  timeline: { date: string; title: string; body: string }[];
  timelineKicker: string;
  timelineHeading: string;
  protectEyebrow: string;
  protectHeading: string;
  protectBlurb: string;
  protectionTips: { title: string; text: string }[];
  bottomLineEyebrow: string;
  bottomLineHeading: string;
  bottomLineBody: string;
  keyFacts: { label: string; value: string }[];
  guidanceEyebrow: string;
  guidanceHeading: string;
  guidanceBlurb: string;
  scopeItems: string[];
  whyItMatters: string;
  relatedStories: { tag: string; title: string; time: string }[];
  newsletterKicker: string;
  newsletterHeading: string;
  newsletterBlurb: string;
  stats: { k: string; v: string }[];
};

export const staticArticle: StaticArticle = {
  outlet: a.outlet,
  section: a.section,
  kicker: a.kicker,
  title: a.title,
  dek: a.dek,
  byline: a.byline,
  published: a.published,
  updated: a.updated,
  readTime: a.readTime,
  location: a.location,
  heroCaption: a.heroCaption,
  tickerItems,
  editorNote:
    "Developing report on alleged compromises involving Edward Jones in Louisiana, Iranian-linked hackers, and elderly U.S. targets. Advisor Beau Wilson is under investigation. Activity began last month. Reported losses: upwards of $1.3 billion. Affected branches are under heavy FTC and IRS audit. If you are facing something similar, do not be afraid, refrain from contacting advisors, and file with the FTC at ReportFraud.ftc.gov.",
  bodySections,
  quotes,
  timeline,
  timelineKicker: "Chronology",
  timelineHeading: "How the Louisiana campaign unfolded",
  protectEyebrow: "For seniors & families",
  protectHeading: "Facing something similar in Louisiana?",
  protectBlurb:
    "Do not be afraid. Compromised Edward Jones branches are under heavy FTC and IRS audit. Advisor Beau Wilson is under investigation. Losses are upwards of $1.3 billion. Refrain from contacting advisors — file a report with the FTC instead.",
  protectionTips,
  bottomLineEyebrow: "The bottom line",
  bottomLineHeading: "$1.3B. Louisiana. Report to the FTC.",
  bottomLineBody:
    "Iranian-linked hackers, Edward Jones in Louisiana, and a deliberate focus on elderly Americans — with advisor Beau Wilson under investigation, the campaign underway since last month, and losses climbing upwards of $1.3 billion. Those branches are under heavy FTC and IRS audit. If you are facing something similar, do not be afraid. Refrain from contacting advisors. File a report at the FTC instead.",
  keyFacts,
  guidanceEyebrow: "Immediate guidance",
  guidanceHeading: "Do not be afraid. Skip advisors. File with the FTC.",
  guidanceBlurb:
    "Louisiana Edward Jones branches are under heavy FTC and IRS investigation. Advisor Beau Wilson is under probe after losses upwards of $1.3 billion.",
  scopeItems: [
    "Edward Jones",
    "Louisiana branches",
    "Beau Wilson under investigation",
    "Iranian-linked hackers",
    "Elderly Americans targeted",
    "Losses upwards of $1.3B",
    "FTC & IRS audits ongoing",
    "Report to FTC, not advisors",
  ],
  whyItMatters:
    "Local branch trust turned into a $1.3B emergency for seniors.",
  relatedStories,
  newsletterKicker: "CWN alerts",
  newsletterHeading: "Follow the Edward Jones investigation",
  newsletterBlurb:
    "Get updates when the FTC, IRS, or investigators issue new guidance for affected clients in Louisiana.",
  stats: [
    { k: "Losses", v: "$1.3B+" },
    { k: "Firm", v: "Edward Jones" },
    { k: "Under probe", v: "Beau Wilson" },
    { k: "Action", v: "File w/ FTC" },
  ],
};