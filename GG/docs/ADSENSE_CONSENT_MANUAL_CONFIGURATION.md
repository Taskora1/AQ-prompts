# AdSense consent and account-side setup

The site currently has a production consent layer for the services that are actually configured:

- Google Analytics 4 and Microsoft Clarity load only after Analytics consent.
- Optional preference storage is off until Preferences consent.
- Google Consent Mode defaults `analytics_storage`, `ad_storage`, `ad_user_data`, and `ad_personalization` to `denied`.
- Advertising consent is stored, but no AdSense or other advertising script has been added because no real publisher ID is configured.

## Required before enabling AdSense

The custom site banner is not represented as a Google-certified CMP. Before serving personalized AdSense ads to users in the EEA, UK, or Switzerland:

1. In the AdSense account, open **Privacy & messaging**.
2. Create and publish a European regulations message using Google's CMP, or choose another CMP from Google's certified CMP list.
3. Configure the consent choices, applicable regions, languages, privacy-policy URL, and the Google/common advertising vendors actually used.
4. Integrate that certified CMP with the site's consent UI. Avoid showing two competing consent dialogs. The certified CMP must control advertising consent and provide the required IAB TCF signals where applicable.
5. Test that advertising tags do not run before the required consent and that refusal remains available and as easy to use as acceptance.
6. Add the real AdSense publisher ID only after it exists. Do not use a placeholder ID.
7. Publish `/ads.txt` with the exact line shown in the AdSense account, then verify it from `https://www.aqprompts.com/ads.txt`.

## Verification checklist

- Test a first visit in a clean browser profile: GA4 and Clarity requests must be absent before Analytics consent.
- Test **Reject optional**: Analytics, Advertising, and Preferences must remain off.
- Test granular choices and reopen **Cookie Settings** from the footer.
- Test withdrawing Analytics consent; the page reload removes previously initialized analytics.
- Use browser developer tools and the Google Tag Assistant consent view to confirm the default and updated Consent Mode states.
- Re-run these tests after adding a certified CMP or any advertising, analytics, affiliate, or embedded third-party service.

Account ownership, AdSense review submission, CMP publication in the AdSense dashboard, and issuance of the real publisher ID require the site owner's authenticated account and cannot be completed from source code alone.
