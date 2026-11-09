# AQPrompts Resend Automation Setup Template

Use this template to fill the production details for the AQPrompts newsletter and weekly prompt digest automation.

## 1. Resend Account

Resend dashboard:

```text
Website: https://resend.com
API Key Name: AQPrompts Production
API Key: paste into Vercel as RESEND_API_KEY
Sending From: AQPrompts <hello@aqprompts.com>
```

## 2. Domain Verification

In Resend, add this domain:

```text
Domain: aqprompts.com
```

Copy the DNS records from Resend and add them in your domain/DNS provider.

Fill this section while adding DNS:

```text
DNS Provider:
Record 1 Type:
Record 1 Name:
Record 1 Value:

Record 2 Type:
Record 2 Name:
Record 2 Value:

Record 3 Type:
Record 3 Name:
Record 3 Value:
```

After DNS is saved, go back to Resend and click verify.

## 3. Local Environment

Local file:

```text
.env.local
```

Required values:

```env
RESEND_API_KEY=your_resend_api_key_here
WEEKLY_PROMPTS_TO=hello@aqprompts.com
CRON_SECRET=your_long_random_secret_here
```

Notes:

```text
RESEND_API_KEY: From Resend dashboard.
WEEKLY_PROMPTS_TO: Email that receives the weekly prompt digest.
CRON_SECRET: Long private random text used to protect the cron route.
```

## 4. Vercel Environment Variables

Vercel path:

```text
Vercel Dashboard -> AQPrompts Project -> Settings -> Environment Variables
```

Add these variables to Production, Preview, and Development:

```env
RESEND_API_KEY=your_resend_api_key_here
WEEKLY_PROMPTS_TO=hello@aqprompts.com
CRON_SECRET=your_long_random_secret_here
```

Important:

```text
Use the same CRON_SECRET in Vercel that you use for testing the cron endpoint.
Do not commit real API keys to Git.
```

## 5. Newsletter Signup Test

Route used by the website:

```text
POST /api/newsletter/subscribe
```

Request body:

```json
{
  "email": "your-test-email@example.com"
}
```

Expected response:

```json
{
  "success": true
}
```

Expected email subject:

```text
🎨 Here are 5 free AI portrait prompts for you!
```

## 6. Weekly Cron Test

Route:

```text
GET /api/cron/weekly-prompts
```

Required header:

```text
Authorization: Bearer your_long_random_secret_here
```

Expected response:

```json
{
  "success": true
}
```

Expected email subject:

```text
🔥 This week's top AI prompts from AQPrompts
```

## 7. Deployment Checklist

Before deploy:

```text
[ ] Resend API key created
[ ] aqprompts.com verified in Resend
[ ] RESEND_API_KEY added to Vercel
[ ] WEEKLY_PROMPTS_TO added to Vercel
[ ] CRON_SECRET added to Vercel
[ ] npm run lint passes
[ ] npm run build passes
[ ] Newsletter signup tested
[ ] Weekly cron route tested
```
