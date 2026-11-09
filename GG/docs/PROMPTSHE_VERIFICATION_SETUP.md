# Promptshe Member Verification System

This guide contains the Google Apps Script backend code and setup steps for the Promptshe 3-day trial verification flow.

## Google Sheet Columns

Create a private Google Sheet with this first row:

```txt
Name | Normalized Number | Join Date | Trial End Date | Status | Last Submit At
```

Use these status values:

```txt
Active Trial
Trial Used
Removed
```

## Code.gs

Paste this into Extensions > Apps Script > Code.gs.

```javascript
const SHEET_NAME = 'Sheet1';
const DEFAULT_COUNTRY_CODE = '92';
const TRIAL_DAYS = 3;
const RATE_LIMIT_SECONDS = 60;

function getPrivateConfig() {
  const properties = PropertiesService.getScriptProperties();
  const whatsappLink = properties.getProperty('WHATSAPP_LINK');
  const paymentLink = properties.getProperty('PAYMENT_LINK') || '';
  const sharedSecret = properties.getProperty('PROMPTSHE_SHARED_SECRET');

  if (!whatsappLink || !sharedSecret) throw new Error('Required script property is missing.');

  return { whatsappLink, paymentLink, sharedSecret };
}

function doPost(e) {
  try {
    const privateConfig = getPrivateConfig();
    const data = parseRequestData(e);

    if (cleanText(data.sharedSecret) !== privateConfig.sharedSecret) {
      return jsonResponse({ success: false, message: 'Unauthorized.' });
    }

    const name = cleanText(data.name);
    const countryCode = cleanDigits(data.countryCode || DEFAULT_COUNTRY_CODE) || DEFAULT_COUNTRY_CODE;
    const number = normalizePhone(data.phone, countryCode);

    if (!name || !number) {
      return jsonResponse({ success: false, message: 'Please enter your name and WhatsApp number.' });
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);

    try {
      const sheet = getSheet();
      ensureHeaders(sheet);
      const rows = sheet.getDataRange().getValues();
      const existing = findExistingNumber(rows, number);
      const now = new Date();

      if (existing) {
        const status = cleanText(existing.status).toLowerCase();
        const lastSubmitAt = parseSheetDate(existing.lastSubmitAt);

        if (lastSubmitAt && (now.getTime() - lastSubmitAt.getTime()) / 1000 < RATE_LIMIT_SECONDS) {
          return jsonResponse({
            success: false,
            message: 'Please wait a minute before submitting again.',
          });
        }

        sheet.getRange(existing.rowIndex, 6).setValue(now);

        if (status === 'joined' || status === 'member' || status === 'paid') {
          return jsonResponse({
            success: false,
            message: 'This WhatsApp number has already joined the community. Please contact admin if you need help.',
          });
        }

        if (status === 'trial used' || status === 'removed') {
          return jsonResponse({
            success: false,
            message: 'You have already used your free trial. Please purchase a membership to join.',
            paymentLink: privateConfig.paymentLink,
          });
        }

        return jsonResponse({
          success: false,
          message: 'This WhatsApp number is already registered for a trial. Please contact admin or purchase a membership to join again.',
          paymentLink: privateConfig.paymentLink,
        });
      }

      const joinDate = new Date();
      const trialEndDate = new Date(joinDate);
      trialEndDate.setDate(joinDate.getDate() + TRIAL_DAYS);

      sheet.appendRow([
        name,
        number,
        formatDate(joinDate),
        formatDate(trialEndDate),
        'Active Trial',
        now,
      ]);

      return jsonResponse({
        success: true,
        message: 'Welcome! Here is your community link.',
        joinLink: privateConfig.whatsappLink,
      });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return jsonResponse({
      success: false,
      message: 'Something went wrong. Please try again later.',
    });
  }
}

function doGet() {
  return jsonResponse({ success: true, message: 'Promptshe verification API is running.' });
}

function parseRequestData(e) {
  if (!e) return {};
  if (e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (error) {
      return e.parameter || {};
    }
  }
  return e.parameter || {};
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Sheet not found: ' + SHEET_NAME);
  return sheet;
}

function ensureHeaders(sheet) {
  const headers = ['Name', 'Normalized Number', 'Join Date', 'Trial End Date', 'Status', 'Last Submit At'];
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasHeaders = headers.every((header, index) => cleanText(firstRow[index]) === header);
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function findExistingNumber(rows, number) {
  for (let i = 1; i < rows.length; i++) {
    const rowNumber = normalizePhone(rows[i][1], DEFAULT_COUNTRY_CODE);
    if (rowNumber === number) {
      return {
        rowIndex: i + 1,
        status: rows[i][4],
        lastSubmitAt: rows[i][5],
      };
    }
  }
  return null;
}

function normalizePhone(value, countryCode) {
  let number = String(value || '').replace(/[\s\-()]/g, '').trim();
  const code = cleanDigits(countryCode || DEFAULT_COUNTRY_CODE) || DEFAULT_COUNTRY_CODE;

  number = number.replace(/[^\d+]/g, '');
  if (number.startsWith('00')) number = number.slice(2);
  if (number.startsWith('+')) number = number.slice(1);
  if (number.startsWith('0')) number = code + number.slice(1);

  return cleanDigits(number);
}

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function cleanDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function parseSheetDate(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) return value;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
```

## Website Form Behavior

The website form at `/promptshe-trial` now accepts any international country code.

Examples that normalize correctly:

```txt
+923001234567 -> 923001234567
923001234567 -> 923001234567
0300 1234567 with +92 selected -> 923001234567
+14155552671 -> 14155552671
00442071234567 -> 442071234567
```

The form does not use reCAPTCHA now.

## Setup Steps

1. Create a Google Sheet and keep it private.
2. Add these headers in row 1: `Name`, `Normalized Number`, `Join Date`, `Trial End Date`, `Status`, `Last Submit At`.
3. Open the Sheet, then go to Extensions > Apps Script.
4. Paste the full `Code.gs` above.
5. In Apps Script, open Project Settings > Script Properties.
6. Add `WHATSAPP_LINK` with the private community invite URL, `PAYMENT_LINK` with the checkout URL, and `PROMPTSHE_SHARED_SECRET` with a long random value. Do not paste any of these values into source code.
7. If your sheet tab is not called `Sheet1`, update this line:

```javascript
const SHEET_NAME = 'Sheet1';
```

8. Deploy Apps Script: Deploy > New deployment > Web app.
9. Set Execute as: `Me`.
10. Set Who has access: `Anyone`.
11. Copy the Web App URL.
12. In Vercel env vars, add:

```txt
PROMPTSHE_TRIAL_WEB_APP_URL=your_apps_script_web_app_url
PROMPTSHE_TRIAL_SHARED_SECRET=the_same_long_random_value
```

13. Redeploy the website.

## Security Notes

- Do not make the Google Sheet public or editable by anyone.
- Keep `WHATSAPP_LINK`, `PAYMENT_LINK`, and `PROMPTSHE_SHARED_SECRET` in Script Properties, never in `Code.gs`.
- Only deploy the Apps Script as the API layer; users should never edit the sheet directly.
- Keep `Trial Used` and `Removed` statuses manually controlled by you or a trusted admin only.
- Duplicate numbers do not get the WhatsApp link again.
- Existing `Active Trial`, `Joined`, `Member`, `Paid`, `Trial Used`, or `Removed` numbers are blocked from getting another free trial.
