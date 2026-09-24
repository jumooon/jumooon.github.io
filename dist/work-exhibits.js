// Only the exhibition preview uses this manifest. Main-site content is unchanged.
window.workExhibits = {
  email: {
    takeaway: 'Generate replies and summarize an email thread without leaving Gmail.',
    type: 'video', src: 'exhibits/email-demo.mp4',
    alt: 'Email Auto Generator demonstration recording.',
    caption: 'Email Auto Generator / Product demonstration / November 2025',
    note: 'Local preview only. Review the recording for private correspondence and contact details before publication.',
    link: 'exhibits/email-demo.mp4', label: 'Open video'
  },
  mediroute: {
    takeaway: 'The market and revenue case behind a healthcare-routing concept.',
    layout: 'pair',
    src: 'exhibits/mediroute-presentation.jpg', width: 590, height: 394,
    alt: 'MediRoute project presentation on stage.',
    caption: 'MediRoute / Project presentation / 2025',
    link: 'exhibits/mediroute-presentation.pdf', label: 'View presentation · PDF, 17 pages',
    secondary: {
      src: 'exhibits/mediroute-event.jpg', width: 1086, height: 724,
      alt: 'Attendees seated at the project presentation event.',
      caption: 'MediRoute / Presentation event'
    }
  },
  investment: {
    takeaway: 'Company fundamentals, sentiment, and portfolio performance in one investment view.',
    src: 'exhibits/investment.png', width: 999, height: 826,
    alt: 'Technology stock screening dashboard with factor scores, sentiment and portfolio performance.',
    caption: 'Stock screening / Tableau / Published August 21, 2026',
    note: 'The dashboard shows its original reporting period, separate from the follow-up portfolio return described below.',
    // Live on the detail page, through Tableau's Embedding API v3 web component.
    // A raw iframe does NOT work here: public.tableau.com refuses to be framed
    // ("refused to connect"), observed in Chrome. The v3 component is what
    // Tableau's own docs use for Tableau Public, and it builds the frame itself.
    // Plain view URL, no :embed query — the component takes attributes instead.
    // The screenshot stays in the DOM as the page-turn poster, because the
    // component's frame is not captured by the foreignObject rasterisation.
    embed: 'https://public.tableau.com/views/AperiohubInternship/Dashboard1', embedType: 'tableau',
    embedTitle: 'Stock screening dashboard, live on Tableau Public',
    link: 'https://public.tableau.com/app/profile/jiung.moon/viz/AperiohubInternship/Dashboard1', label: 'Explore dashboard'
  },
  environment: {
    takeaway: 'See how departmental spending translates into estimated carbon emissions.',
    src: 'exhibits/carbon-sankey.jpg', width: 2400, height: 1118,
    alt: 'AS Carbon Audit Sankey diagram showing emissions flowing from offices to expenditure categories.',
    caption: 'AS Carbon Audit 2024–2025 / Emissions flow: office → expenditure category',
    // Live on the detail page. Unlike public.tableau.com, shinyapps.io does serve
    // inside a frame — verified in Chrome, the deck renders and pages. A plain
    // iframe is enough; the screenshot below is the page-turn poster.
    embed: 'https://jiungmoon.shinyapps.io/slides/', embedType: 'frame',
    embedTitle: 'AS Carbon Audit presentation, live',
    link: 'https://jiungmoon.shinyapps.io/slides/#/total-emissions-by-office-stacked-by-category', label: 'View presentation'
  },
  research: {
    takeaway: 'From regional coverage to grid-level labels: preparing satellite imagery for poverty research.',
    layout: 'pair',
    src: 'exhibits/research-map.jpg', width: 1400, height: 1106,
    alt: 'Research coverage map around Palembang.',
    caption: 'Palembang, Indonesia / Regional research coverage',
    secondary: {src: 'exhibits/satellite.jpg', width: 1800, height: 1421, alt: 'Palembang satellite imagery overlaid with a colored research grid.', caption: 'Enlarged satellite view / Grid-level spatial labeling'}
  },
  'apple-warranty': {
    takeaway: 'Locate refurbishment-demand hotspots to inform inventory planning.',
    src: 'exhibits/apple-country-user.png', width: 2004, height: 1600,
    alt: 'Apple warranty and refurbishment forecast dashboard showing country-level demand on a map.',
    caption: 'Warranty & refurbishment / Country-level forecast / Tableau',
    embed: 'https://public.tableau.com/views/AppleWarrantyQCRefurbForecast/Country', embedType: 'tableau',
    embedTitle: 'Warranty and refurbishment forecast dashboard, live on Tableau Public',
    link: 'https://public.tableau.com/app/profile/jiung.moon/viz/AppleWarrantyQCRefurbForecast/Country', label: 'Explore dashboard'
  },
  marketing: {
    takeaway: 'Compare channel costs and estimated response in an exploratory synthetic-data study.',
    src: 'exhibits/marketing.png', width: 925, height: 573,
    alt: 'Marketing channel efficiency matrix comparing CPM and estimated OLS coefficients for four channels.',
    caption: 'Channel efficiency matrix / Report excerpt / Synthetic data',
    note: 'An exploratory methodology exercise, not measured campaign lift. Channel coefficients were not statistically significant.',
    link: 'exhibits/marketing-report.pdf', label: 'Read report · PDF, 8 pages',
    override: {
      highlight: 'OLS', highlightLabel: 'Exploratory study · synthetic data',
      summary: 'Explored channel response and a budget-allocation scenario using synthetic data.',
      sections: {
        context: 'This coursework combined marketing data with awareness metrics to construct a synthetic dataset for a methodology exercise.',
        challenge: 'Explore how channel-level response estimates could inform a budget-allocation hypothesis, while separating model output from reliable evidence.',
        contribution: 'I prepared the data, fitted an OLS model, visualized channel coefficients against CPM, and explored a 30% budget-reallocation scenario.',
        outcome: 'Produced a channel-comparison framework and a budget-allocation hypothesis. The fitted model had R² = 0.042 and no channel coefficient was statistically significant. The report uses inconsistent percentage language for the scenario, so no uplift figure is presented here.',
        reflection: 'These results do not establish campaign effectiveness. Stronger data and a controlled campaign test would be needed before recommending the allocation as a proven improvement.'
      }
    }
  }
};
