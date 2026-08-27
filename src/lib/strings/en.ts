/**
 * Every English string the site shows.
 *
 * This file is the source of truth for the shape of a translation: `ar.ts` is
 * typed against it, so a missing key or a renamed one is a compile error rather
 * than an English word appearing in the middle of an Arabic page.
 *
 * Values with a placeholder are written as functions rather than templates with
 * `%s`, because a function gets its arguments checked and named. Values headed
 * for the browser bundle are the exception — see `client` at the bottom.
 */
export const en = {
  /* ------------------------------- chrome -------------------------------- */
  meta: {
    /** What the switch offers, so it always names the language you are NOT in. */
    otherLangShort: "ع",
    otherLangName: "العربية",
    switchLabel: "Switch to Arabic",
  },

  nav: {
    tools: "Tools",
    pricing: "Pricing",
    yourLinks: "Your links",
    signIn: "Sign in",
    signOut: "Sign out",
    admin: "Admin",
    account: "Account",
    share: "Share a PDF",
    menu: "Menu",
    themeTitle: "Switch theme",
    themeLabel: "Switch between light and dark mode",
  },

  footer: {
    tagline: "pdf.sy — every PDF tool in one place.",
    privacy: "Privacy",
    terms: "Terms",
    report: "Report a file",
  },

  beta: {
    badge: "Beta",
    tipLabel: "About the pdf.sy beta",
    tip: "pdf.sy is still being built. Full launch is expected very soon.",
    title: "You are early",
    leadPlain: "pdf.sy is still being built.",
    leadStrong: "Full launch is expected very soon.",
    body: "Everything here is real and working, but it is being changed daily. Please do not rely on it for anything that matters yet.",
    item1: "Merge, split and rotate — free, and never uploaded",
    item2: "Share a PDF and get a tracked link",
    item3: "See who opened it and which pages they read",
    item4: "Accounts and paid plans are still being wired up",
    expiry: "Links made without an account are deleted after seven days, so keep your own copy of anything you upload.",
    gotIt: "Got it",
    tryIt: "Try it anyway",
  },

  /* ------------------------------- landing ------------------------------- */
  landing: {
    title: "pdf.sy — every PDF tool in one place",
    description:
      "Merge, split, rotate and compress PDFs free in your browser — then share one as a link and see who actually read it.",
    badge: "No account needed to try it",
    heroTitle: "Every PDF tool in one place.",
    heroBody:
      "Merge, split, rotate and compress — free, inside your browser, with nothing uploaded. And when you send one, share it as a link that tells you who actually read it.",
    ctaTools: "Open the tools",
    ctaShare: "Share a PDF",

    shareTitle: "And one thing the other toolboxes do not do",
    shareBody:
      "Send a PDF as a short link instead of an attachment, and find out what happened to it afterwards.",

    step1Title: "One short link",
    step1Body:
      "pdf.sy/a7f3k9 opens in a fast, mobile-friendly viewer. No download prompt, no “open in Acrobat”, no Drive permission screen.",
    step2Title: "Page-by-page insight",
    step2Body:
      "See time spent on every page. When a client rereads your pricing page twice, you know before you pick up the phone.",
    step3Title: "Print it anywhere",
    step3Body:
      "Every link comes with a QR code. Put a menu, a brochure, or a price list on a sign and update the file without reprinting.",

    toolsTitle: "Everything you do to a PDF",
    toolsBody:
      "Merging, splitting and rotating all run inside your browser. Your file never leaves your device — which is faster than uploading it anyway. More tools are on the way.",
    mergeName: "Merge",
    mergeBody: "Combine PDFs in any order",
    splitName: "Split",
    splitBody: "Pull out a page range",
    rotateName: "Rotate",
    rotateBody: "Fix sideways scans",
    compressName: "Compress",
    compressBody: "Shrink for email",
    convertName: "Convert",
    convertBody: "To and from Word and images",
    editName: "Edit",
    editBody: "Reorder, delete and add pages",
    soon: "Soon",
  },

  /* -------------------------------- tools -------------------------------- */
  tools: {
    title: "Free PDF tools — merge, split, rotate, compress | pdf.sy",
    description: "Merge, split, rotate and compress PDFs in your browser. Nothing is uploaded.",
    h1: "PDF tools",
    lead: "Everything here runs inside your browser. Your files are never uploaded, which is why it is instant even for a 40 MB scan.",
    tabMerge: "Merge",
    tabSplit: "Split",
    tabRotate: "Rotate",
    mergeTitle: "Merge PDFs",
    mergeBody: "Add two or more files. They are joined top to bottom in the order listed.",
    splitTitle: "Split a PDF",
    splitBody: "Keep a page range and drop the rest. Pages are numbered from 1.",
    from: "From",
    to: "To",
    rotateTitle: "Rotate pages",
    rotateBody: "Turn every page a quarter turn at a time. Useful for scans that came in sideways.",
    angle90: "90° clockwise",
    angle180: "180°",
    angle270: "90° counter-clockwise",
    run: "Run",
    download: "Download result",
    shareResult: "Share it as a tracked link →",
  },

  /* -------------------------------- upload ------------------------------- */
  upload: {
    title: "Share a PDF — pdf.sy",
    h1: "Share a PDF",
    lead: "Drop a file in. You will get a link and a QR code straight away.",
    choose: "Choose a PDF or drop it here",
    hint: (mb: string, days: string) =>
      `Up to ${mb} MB · links from anonymous uploads expire in ${days} days`,
    uploading: "Uploading…",
    resultTitle: "Your link is live",
    resultBody: "Anyone with this link can open the document.",
    copy: "Copy",
    qrAlt: "QR code for this link",
    openViewer: "Open the viewer",
    seeStats: "See who opens it",
    downloadQr: "Download QR as SVG",
    keepTab:
      "Keep this tab's link to your stats page — it is the only way back in until accounts arrive.",
  },

  /* -------------------------------- stats -------------------------------- */
  stats: {
    title: "Stats — pdf.sy",
    suffix: "stats",
    privateH1: "This stats page is private",
    privateBody:
      "Sign in with the account that owns this link, or open it from the tab where you created it.",
    signIn: "Sign in",
    backArrow: "←",
    backAll: "All your links",
    backShare: "Share another",
    views: "Views",
    totalTime: "Total time",
    avgPerView: "Avg. per view",
    perPageTitle: "Time spent per page",
    proGate: "Per-page reading time is a Pro feature. You can still see totals above.",
    seePlans: "See plans",
    noPageData: "No page data yet. It appears the moment someone opens the link.",
    page: (n: number) => `Page ${n}`,
    recentTitle: "Recent views",
    when: "When",
    where: "Where",
    time: "Time",
    reached: "Reached",
    nobody: "Nobody has opened it yet.",
    reachedPage: (n: number) => `page ${n}`,
  },

  /* ------------------------------ dashboard ------------------------------ */
  dashboard: {
    title: "Your links — pdf.sy",
    h1: "Your links",
    share: "Share a PDF",
    emptyH2: "No links yet",
    emptyBody:
      "Share a PDF and this page fills up with who opened it, for how long, and where they stopped reading.",
    emptyCta: "Share your first PDF",
    expires: (date: string) => `expires ${date}`,
    views: "views",
    readTime: "read time",
    lastOpened: "last opened",
    emailMe: "Email me",
    stats: "Stats",
  },

  /* ------------------------------- pricing ------------------------------- */
  pricing: {
    title: "Pricing — pdf.sy",
    description: "Free to share. Three dollars a month to know who read it.",
    h1: "Simple pricing",
    lead: "The free tier is genuinely useful — a link nobody can open is not much of a product. You pay when you want to know what happened after you sent it.",
    period: "Billing period",
    monthly: "Monthly",
    yearly: "Yearly",
    save: "Save 33%",
    freeName: "Free",
    freeAmount: "$0",
    forever: "forever",
    perMonth: "per month",
    perMonthYearly: "per month, billed yearly",
    free1: "5 active links",
    free2: "Total view counts",
    free3: "All browser-side tools",
    free4: "QR code for every link",
    free5: "Revoke any link",
    lite1: "Unlimited links",
    lite2: "Per-page reading time",
    lite3: "Email when someone opens it",
    lite4: "Password, expiry, block downloads",
    lite5: "Replace the file, keep the link",
    lite6: "No pdf.sy badge",
    pro1: "Everything in Lite",
    pro2: "Team spaces",
    pro3: "Require an email to view",
    pro4: "Per-viewer watermarks",
    pro5: "Custom domain",
    pro6: "API access",
    yourPlan: "Your plan",
    choose: (name: string) => `Choose ${name}`,
    startFree: "Start free",
    manage: "Manage your subscription",
    manageRest: " — change plan, update card, or cancel.",
  },

  /* -------------------------------- auth --------------------------------- */
  auth: {
    title: "Sign in — pdf.sy",
    sentH1: "Check your email",
    sentBody:
      "If that address has an inbox we can reach, a sign-in link is on its way. It works once and expires in 15 minutes.",
    h1: "Sign in",
    lead: "No password. We email you a link that signs you straight in.",
    unverified:
      "No link was sent — the human check below was not completed. Tick it, then press the button again.",
    emailLabel: "Email",
    emailPlaceholder: "you@company.com",
    submit: "Email me a link",
    stayLabel: "Stay signed in",
    stayTipLabel: "What does staying signed in do?",
    stayTip:
      "Ticked, this browser stays signed in for 30 days. Unticked, you are signed out when you close the browser — use that on a shared or public computer.",
    claimNote:
      "Signing in also claims any links you created on this device, so they stop expiring.",
    expiredTitle: "Link expired — pdf.sy",
    expiredH1: "That link no longer works",
    expiredBody: "Sign-in links expire after 15 minutes and can only be used once.",
    sendNew: "Send me a new one",
  },

  /* ------------------------------- viewer -------------------------------- */
  viewer: {
    unavailableTitle: "Link unavailable — pdf.sy",
    unavailableH1: "This link is no longer available",
    unavailableBody: "It may have expired, been revoked by its owner, or never existed.",
    shareOwn: "Share a PDF of your own",
    passwordTitle: "Password required — pdf.sy",
    protectedH1: "This document is protected",
    protectedBody: "Enter the password the sender gave you.",
    passwordPlaceholder: "Password",
    wrong: "That password is not right.",
    throttled: "Too many attempts from here. Wait a few minutes, then try again.",
    open: "Open document",
    loading: "Loading document…",
    download: "Download",
    sharedWith: "Shared with",
    reportFile: "Report this file",
    /* Plain-text responses from the file endpoint. */
    gone: "This link is no longer available.",
    locked: "This document is password protected.",
    notFound: "Not found.",
    downloadsOff: "Downloads are disabled for this link.",
  },

  /* ------------------------------- report -------------------------------- */
  report: {
    title: "Report a file — pdf.sy",
    description: "Tell us about a pdf.sy link that breaks our terms.",
    sentH1: "Report received",
    sentBody:
      "Thank you. We review every report and act on the ones that break our terms. If you left an email, we will tell you what we decided.",
    backHome: "Back to pdf.sy",
    h1: "Report a file",
    leadBefore: "If a pdf.sy link points at something that breaks our ",
    leadLink: "terms",
    leadAfter: ", tell us and we will look at it.",
    badLink:
      "We could not read that as a pdf.sy link. Paste the whole link, or just the code at the end of it.",
    linkLabel: "The link",
    linkPlaceholder: "pdf.sy/a7f3k9",
    reasonLabel: "What is wrong with it",
    reasonPlaceholder: "Tell us what this file is and why it should be removed.",
    emailLabel: "Your email",
    optional: "(optional)",
    emailPlaceholder: "you@example.com",
    send: "Send report",
    note: "Reports are read by a person. Deliberately false reports waste that person's time, so please only send one if you mean it.",
  },

  /* ------------------------------ not found ------------------------------ */
  notFound: {
    title: "Not found — pdf.sy",
    h1: "Nothing here",
    body: "That page or link does not exist.",
    home: "Go home",
  },

  /* ---------------------------- link settings ---------------------------- */
  settings: {
    h2: "Link settings",
    refusedAfter: " is a Pro feature. Everything else you changed was saved.",
    seePlans: "See plans",
    updated: (version: string) =>
      `Replaced the file — everyone holding this link now sees version ${version}.`,
    nameLabel: "Name",
    nameHint: "Only you see this. Useful when one document has several links.",
    passwordLabel: "Password",
    passwordHint: "Visitors must enter this before the document loads.",
    passwordSet: "Set — type to replace",
    passwordNone: "No password",
    passwordRemove: "Remove the password",
    expiresLabel: "Expires",
    expiresHint: "After this date the link stops working. Leave empty for never.",
    downloadLabel: "Downloading",
    downloadHint: "Turning this off hides the download button and blocks the file endpoint.",
    downloadAllow: "Allow visitors to download the file",
    save: "Save settings",
    restore: "Restore this link",
    revoke: "Revoke this link",
    revoked: "Revoked — nobody can open it.",
    replaceTitle: "Replace the file",
    replaceBody:
      "Upload a new PDF and the link stays the same. Anyone who already has it sees the new version, and your view history carries over.",
    replaceCta: "Upload new version",
    pro: "Pro",
    featurePassword: "Password protection",
    featureExpiry: "Link expiry",
    featureBlockDownload: "Blocking downloads",
    featureVersioning: "Replacing the file",
    featureOther: "That setting",
  },

  /* -------------------------------- errors ------------------------------- */
  errors: {
    tooLarge: "That file is too large.",
    tooLargeMb: (mb: string) => `That file is larger than ${mb} MB.`,
    notAPdf: "That file is not a valid PDF.",
    truncated: "That PDF looks incomplete — it may not have finished uploading.",
    activeContent:
      "That PDF contains active content (script, media, or a launch action) and cannot be shared.",
    embeddedFile: "That PDF has another file attached inside it and cannot be shared.",
    encrypted:
      "That PDF is password-protected. Remove its password first — you can set a link password here instead.",
    blocked: "That file has been blocked.",
    rateLimited: "Too many uploads just now. Wait a few minutes and try again.",
    generic: "That file could not be accepted.",
    /* API responses. */
    uploadBurst: "Too many uploads just now. Try again shortly.",
    uploadDaily: "You have reached today's upload limit. Sign in for a higher one.",
    uploadBlocked: "Uploads from here have been blocked.",
    notHuman: "Could not verify your browser. Reload the page and try again.",
    noFile: "No file was sent.",
    fileBlocked: "This file has been blocked.",
    linkFailed: "Could not create a link just now. Please try again.",
    saveFailed: "Could not save that upload. Please try again.",
    tooManyRequests: "Too many requests.",
    tooManyReports: "Too many reports from here. Try again later.",
    untitled: "Untitled",
    notFound: "Not found.",
  },

  /* -------------------------------- email -------------------------------- */
  email: {
    signInSubject: "Your pdf.sy sign-in link",
    signInTitle: "Sign in to pdf.sy",
    signInBody: "This link works once and expires in 15 minutes.",
    signInButton: "Sign in",
    signInIgnore: "If you did not ask for this, you can ignore it — nothing has changed.",
    footer: "pdf.sy — every PDF tool in one place.",
  },

  /* -------------------------------- legal -------------------------------- */
  legal: {
    lastUpdated: (date: string) => `Last updated ${date}`,
    lastUpdatedDate: "23 August 2026",
    /** Only rendered on a translated page. See the note in routes/legal.tsx. */
    translationNote: "",
  },

  privacy: {
    title: "Privacy — pdf.sy",
    description: "What pdf.sy stores, what it never stores, and how long any of it lives.",
    h1: "Privacy",

    shortHeading: "The short version",
    shortBody:
      "We store the PDFs you upload and a record of who opened them. We never store a reader's IP address, and we do not sell anything to anyone. Links made without an account delete themselves after seven days.",

    uploadHeading: "What we store when you upload",
    uploadBody:
      "The file itself, its title, size, page count, and a SHA-256 fingerprint of its contents. The fingerprint lets us block a file that has been reported for abuse without keeping a copy of it after removal.",

    viewHeading: "What we store when someone opens your link",
    viewIntro: "For each view we record:",
    viewItem1: "The country, as reported by our edge network — never a city or address.",
    viewItem2: "Whether the device is mobile or desktop.",
    viewItem3: "The referring page, if the browser sent one.",
    viewItem4: "Time spent, in total and on each page.",
    viewItem5: "A one-way hash standing in for the reader's IP address.",
    viewBody:
      "That last one deserves detail, because it is the difference between analytics and surveillance. We never write the IP address down. We combine it with the link's own identifier and the current date, hash the result, and keep only the first 32 characters. Because the date is part of the input, the same reader produces a different hash tomorrow; because the link is part of the input, the same reader produces a different hash on someone else's document. It exists to separate two readers on one link on one day, and it cannot do anything else.",

    accountHeading: "What we store if you make an account",
    accountBody1:
      "Your email address, and nothing else. There is no password, because we sign you in with a one-time link instead — so there is no password of yours for us to leak.",
    accountBody2:
      "If you subscribe, Stripe handles the payment and sends us back a customer reference and your plan status. Your card details go to Stripe directly and never reach our servers.",

    retentionHeading: "How long it lasts",
    retentionItem1: "Links created without an account: deleted seven days after upload.",
    retentionItem2: "Links owned by an account: kept until you delete them or close the account.",
    retentionItem3: "View records: kept for as long as the link they belong to.",
    retentionItem4: "Abuse reports: kept after removal so a blocked file cannot be re-uploaded.",

    whereHeading: "Where it lives",
    whereBody:
      "Files and database records are stored on Cloudflare's network with a placement hint for Western Europe, which is where the primary copy sits. Cloudflare serves and caches globally, so a reader is answered from wherever they happen to be.",

    sharedHeading: "Who else sees it",
    sharedBody:
      "Cloudflare hosts everything. Stripe processes payments. Resend delivers our email. That is the entire list, and each one only receives what it needs to do its job. We do not sell or share your data for advertising, and there are no third-party trackers or advertising cookies anywhere on this site.",

    cookiesHeading: "Cookies",
    cookiesBody:
      "One cookie keeps you signed in, one remembers that you have entered the password for a protected document, and one remembers which language you chose. All three are strictly necessary for the thing you asked for, and there are no others.",

    rightsHeading: "Your rights",
    rightsBody:
      "You can ask for a copy of what we hold about you, ask us to correct it, or ask us to delete it — including the view records attached to your links. Email us and we will action it. Deleting a link removes the file and every view record belonging to it.",

    readerHeading: "A note for people opening a link",
    readerBody:
      "If someone sent you a pdf.sy link, the person who shared it can see that it was opened, from which country, on what kind of device, and how long you spent on each page. They cannot see your name, your email, or your IP address, because we never give them what we do not keep.",
  },

  terms: {
    title: "Terms — pdf.sy",
    description:
      "The rules for using pdf.sy: what you may upload, what we may remove, and what we promise.",
    h1: "Terms of service",

    whatHeading: "What this service does",
    whatBody:
      "pdf.sy stores a PDF you upload and gives you a short link to it. When someone opens that link, we record how they read it and show that back to you. Some features require a paid plan.",

    forbiddenHeading: "What you may not upload",
    forbiddenIntro:
      "You are responsible for every file you upload and for having the right to share it. Do not upload anything that:",
    forbiddenItem1: "Infringes someone else's copyright or other rights.",
    forbiddenItem2: "Contains malware, or exists to phish or defraud.",
    forbiddenItem3: "Contains sexual content involving minors, or any other illegal material.",
    forbiddenItem4: "Contains another person's private information shared without their consent.",
    forbiddenBody:
      "We may remove any file and disable any link, with or without notice, when we believe this section has been broken. A removed file's fingerprint is retained so that it cannot simply be uploaded again.",

    anonHeading: "Links without an account",
    anonBody:
      "A link created without an account stops working seven days after it is made, and the file is deleted. This is not a bug and it is not a backup — if the document matters, make an account or keep your own copy.",

    accountsHeading: "Accounts",
    accountsBody:
      "Keep access to your email address, because anyone who can read your inbox can sign in as you. Tell us promptly if you think someone else has access to your account.",

    paidHeading: "Paid plans",
    paidBody1:
      "Paid plans bill monthly in advance through Stripe and renew until you cancel. Cancelling stops the next charge and leaves your plan running to the end of the period you have already paid for. We do not automatically refund partial months, but if something went wrong on our side, write to us and we will sort it out.",
    paidBody2:
      "If a payment fails and stays unpaid, paid features switch off and your account returns to the free plan. Your links and their history are not deleted for non-payment.",

    promiseHeading: "What we promise, and what we do not",
    promiseBody1:
      "We work hard to keep this running and your files intact, but the service is provided as-is, without warranty of any kind. We do not guarantee uninterrupted availability, and we are not liable for indirect or consequential losses. Where liability cannot be excluded, it is limited to what you paid us in the twelve months before the claim.",
    promiseBody2:
      "Analytics are a good-faith measurement, not a forensic record. Browsers and networks vary, and a reader can defeat measurement if they want to. Do not rely on them as proof of anything that matters legally.",

    endingHeading: "Ending things",
    endingBody:
      "You may stop using the service and delete your account at any time. We may suspend or close an account that breaks these terms. If we close the service itself, we will give reasonable notice so you can retrieve your files.",

    changesHeading: "Changes",
    changesBody:
      "We may update these terms. If a change materially affects you, we will tell you before it takes effect. Continuing to use the service after that means you accept the new version.",
  },

  /* -------------------------------- client ------------------------------- */
  /**
   * Strings the browser bundles need. Flat and placeholder-based rather than
   * functions, because this object is serialised into the page as JSON and a
   * function cannot survive that trip. `{name}` is filled in by client/i18n.ts.
   */
  client: {
    checkingBrowser: "Checking your browser…",
    verifyFailed: "Could not verify your browser. Reload the page and try again.",
    uploadingFile: "Uploading {name}…",
    uploadingPct: "Uploading… {pct}%",
    finishing: "Finishing up…",
    uploadFailed: "The upload failed. Check your connection and try again.",
    uploadGeneric: "Something went wrong. Try again.",
    copied: "Copied",
    chooseTwo: "Choose at least two PDFs to merge.",
    chooseSplit: "Choose a PDF to split.",
    chooseRotate: "Choose a PDF to rotate.",
    orderWrong: "The first page must come before the last.",
    merged: "Merged {files} files into {pages} pages.",
    kept: "Kept pages {from}–{to} of {total}.",
    rotated: "Rotated {pages} pages by {angle}°.",
    working: "Working…",
    processFailed: "That file could not be processed.",
    creatingLink: "Creating your link…",
    linkFailed: "The link could not be created. Download the file instead.",
    editedTitle: "Edited document",
    claimed: "Added {n} of the links you created before signing in. They no longer expire. Refreshing…",
    viewerFailed: "This document could not be loaded.",
  },
};

/** The shape every translation must fill. */
export type Strings = typeof en;
